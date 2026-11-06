import { createOllamaAdapter } from '../providers/ollama.ts';
import { createOpenAICompatibleAdapter } from '../providers/openAiCompatible.ts';
import { pool } from '../api/database.ts';
import type { AfgCapability, ChatProviderAdapter, ProviderCatalog, ModelDescriptor, CapabilityFlags, HealthStatus } from '../providers/providerTypes.ts';

// Optional external 9Router instance. It is only registered when both server-side
// credentials are present; the AFG client never sees this API key.
const nineRouterKey = (process.env.NINEROUTER_API_KEY?.trim() || '').replace(/^Bearer\s+/i, '').trim();
const configuredNineRouterBase = (process.env.NINEROUTER_BASE_URL?.trim() || '').replace(/\/+$/, '');
const nineRouterBase = configuredNineRouterBase
  ? (/\/v1$/i.test(configuredNineRouterBase) ? configuredNineRouterBase : configuredNineRouterBase + '/v1')
  : '';
const nineRouterBaseAdapter = nineRouterBase
  ? createOpenAICompatibleAdapter({
      id: '9router',
      displayName: '9Router Gateway',
      baseUrl: nineRouterBase,
      apiKey: nineRouterKey,
      allowEmptyApiKey: true,
      catalogOnlyHealthCheck: true,
    })
  : null;
// 9Router exposes separate capability catalogues. Merge them into one server-side
// catalogue while preserving upstream model IDs and assigning only endpoint-backed capabilities.
const nineRouterModelKinds = new Map<string, string>();
const nineRouterAdapter: ChatProviderAdapter | null = nineRouterBaseAdapter
  ? {
      ...nineRouterBaseAdapter,
      async listModels(): Promise<ModelDescriptor[]> {
        const chatModels = await nineRouterBaseAdapter.listModels();
        const kinds = [
          { kind: 'image', path: '/models/image', capability: 'imageGen' as const },
          { kind: 'image-to-text', path: '/models/image-to-text', capability: 'vision' as const },
          { kind: 'tts', path: '/models/tts', capability: 'tts' as const },
          { kind: 'stt', path: '/models/stt', capability: 'stt' as const },
          { kind: 'embedding', path: '/models/embedding', capability: 'embedding' as const },
          { kind: 'web', path: '/models/web', capability: 'web' as const },
        ];
        const additional = await Promise.all(kinds.map(async ({ kind, path, capability }) => {
          try {
            const response = await fetch(nineRouterBase + path, {
              headers: { ...(nineRouterKey ? { Authorization: 'Bearer ' + nineRouterKey } : {}), Accept: 'application/json' },
              signal: AbortSignal.timeout(15_000),
              redirect: 'error',
            });
            if (!response.ok) return [];
            const payload = await response.json() as any;
            const rows = Array.isArray(payload?.data) ? payload.data
              : Array.isArray(payload?.models) ? payload.models
              : Array.isArray(payload?.data?.data) ? payload.data.data : [];
            return rows.filter((item: any) => item && typeof item.id === 'string').map((item: any): ModelDescriptor => {
              const catalogKind = kind === 'web'
                ? (item.kind === 'webFetch' || item.id.endsWith('/fetch') ? 'webFetch' : 'webSearch')
                : kind;
              nineRouterModelKinds.set(item.id, kind);
              return {
              id: item.id,
              catalogKind,
              providerId: '9router',
              displayName: typeof item.name === 'string' ? item.name : item.id,
              description: 'Discovered from the 9Router ' + kind + ' catalogue.',
              contextWindow: Number(item.context_length || item.context_window || 0) || 0,
              pricing: undefined,
              capabilities: {
                text: false, streaming: false, vision: capability === 'vision',
                imageGen: capability === 'imageGen', imageEdit: false,
                ocr: false, tts: capability === 'tts', stt: capability === 'stt',
                tools: false, jsonMode: false,
                embedding: capability === 'embedding',
                webSearch: capability === 'web' && catalogKind === 'webSearch',
                webFetch: capability === 'web' && catalogKind === 'webFetch',
              },
              enabled: true,
              verifiedAt: null,
            };});
          } catch {
            return [];
          }
        }));
        const merged = [
          ...chatModels.map((model) => ({ ...model, catalogKind: 'llm' })),
          ...additional.flat(),
        ];
        return merged.filter((model, index) =>
          merged.findIndex((candidate) => candidate.id === model.id) === index);
      },
      async healthCheck(modelId: string): Promise<HealthStatus> {
        const kind = nineRouterModelKinds.get(modelId);
        if (!kind) return nineRouterBaseAdapter.healthCheck(modelId);
        const paths: Record<string, string> = {
          image: '/models/image',
          'image-to-text': '/models/image-to-text',
          tts: '/models/tts',
          stt: '/models/stt',
          embedding: '/models/embedding',
          web: '/models/web',
        };
        const path = paths[kind] || '/models';
        const checkedAt = new Date().toISOString();
        try {
          const response = await fetch(nineRouterBase + path, {
            headers: { ...(nineRouterKey ? { Authorization: 'Bearer ' + nineRouterKey } : {}), Accept: 'application/json' },
            signal: AbortSignal.timeout(15_000), redirect: 'error',
          });
          if (!response.ok) return { healthy: false, checkedAt, message: '9Router capability catalogue check failed.' };
          const payload = await response.json() as any;
          const rows = Array.isArray(payload?.data) ? payload.data
            : Array.isArray(payload?.models) ? payload.models
            : Array.isArray(payload?.data?.data) ? payload.data.data : [];
          return { healthy: rows.some((item: any) => item?.id === modelId), checkedAt,
            ...(rows.some((item: any) => item?.id === modelId) ? {} : { message: 'Model is not present in its 9Router capability catalogue.' }) };
        } catch {
          return { healthy: false, checkedAt, message: '9Router capability catalogue is unreachable.' };
        }
      },
    }
  : null;

// APInex account-key pool. Keys stay server-side in Railway Secrets.
// Rotate to the next key only when the current key is rate-limited (HTTP 429).
const apinexKeys = (() => {
  try {
    const value = JSON.parse(process.env.APINEX_API_KEYS || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === 'string' && key.trim().length > 0).map((key) => key.trim()))] : [];
  } catch { return []; }
})();
const apinexBase = (process.env.APINEX_BASE_URL?.trim() || 'https://api.apinex.bond/v1').replace(/\\/+$/, '');
let apinexKeyIndex = 0;
const apinexAdapters = apinexKeys.map((apiKey) => createOpenAICompatibleAdapter({
  id: 'apinex',
  displayName: 'APInex',
  baseUrl: apinexBase,
  apiKey,
}));
const apinexPrimary = apinexAdapters[0] || null;
const apinexAdapter: ChatProviderAdapter | null = apinexPrimary ? {
  ...apinexPrimary,
  async validateConfig() {
    return apinexBase.startsWith('https://') && apinexAdapters.length > 0
      ? { valid: true }
      : { valid: false, message: 'Configure APINEX_API_KEYS with one or more server-side keys.' };
  },
  async listModels() {
    for (let attempt = 0; attempt < apinexAdapters.length; attempt++) {
      const index = (apinexKeyIndex + attempt) % apinexAdapters.length;
      try {
        const models = await apinexAdapters[index].listModels();
        apinexKeyIndex = index;
        return models;
      } catch (error) {
        if (!(error instanceof Error) || (error as any).status !== 429 || attempt === apinexAdapters.length - 1) throw error;
      }
    }
    return [];
  },
  async healthCheck(modelId: string) {
    for (let attempt = 0; attempt < apinexAdapters.length; attempt++) {
      const index = (apinexKeyIndex + attempt) % apinexAdapters.length;
      const health = await apinexAdapters[index].healthCheck(modelId);
      if (health.healthy) { apinexKeyIndex = index; return health; }
      if (attempt === apinexAdapters.length - 1) return health;
    }
    return { healthy: false, checkedAt: new Date().toISOString(), message: 'No APInex key is available.' };
  },
  async *streamChat(input) {
    for (let attempt = 0; attempt < apinexAdapters.length; attempt++) {
      const index = (apinexKeyIndex + attempt) % apinexAdapters.length;
      let emitted = false;
      try {
        for await (const chunk of apinexAdapters[index].streamChat(input)) {
          emitted = true;
          yield chunk;
        }
        apinexKeyIndex = index;
        return;
      } catch (error) {
        const rateLimited = error instanceof Error && (error as any).status === 429;
        if (!rateLimited || emitted || attempt === apinexAdapters.length - 1) throw error;
      }
    }
  },
} : null;

const staticProviderRegistry: ChatProviderAdapter[] = [
  ...(nineRouterAdapter ? [nineRouterAdapter] : []),
  ...(apinexAdapter ? [apinexAdapter] : []),
];
let databaseProviderRegistry: ChatProviderAdapter[] = [];
const DATABASE_PROVIDER_REFRESH_MS = 15_000;
let databaseProviderRefreshAt = 0;

export async function refreshDatabaseProviderAdapters(force = false): Promise<void> {
  if (!pool || (!force && Date.now() - databaseProviderRefreshAt < DATABASE_PROVIDER_REFRESH_MS)) return;
  databaseProviderRefreshAt = Date.now();
  try {
    const result = await pool.query(`SELECT slug,display_name,base_url FROM providers WHERE slug='ollama' AND kind='ollama' AND enabled=true`);
    databaseProviderRegistry = result.rows.map((row) => createOllamaAdapter(String(row.slug), String(row.display_name), process.env.OLLAMA_BASE_URL?.trim() || String(row.base_url || 'http://127.0.0.1:11434')));
  } catch {
    databaseProviderRegistry = [];
  }
}

function allProviderAdapters(): ChatProviderAdapter[] {
  const map = new Map<string, ChatProviderAdapter>();
  for (const provider of [...staticProviderRegistry, ...databaseProviderRegistry]) map.set(provider.id, provider);
  return [...map.values()];
}

const HEALTH_TTL_MS = 5 * 60 * 1000;
const healthCache = new Map<string, { healthy: boolean; checkedAt: string }>();

export function getProviderRegistry(): Array<Pick<ChatProviderAdapter, 'id' | 'key' | 'displayName'>> {
  return allProviderAdapters().map(({ id, key, displayName }) => ({ id, key, displayName }));
}

export function getProviderAdapter(providerId: string): ChatProviderAdapter | undefined {
  return allProviderAdapters().find((provider) => provider.id === providerId);
}

async function isProviderEnabled(providerId: string): Promise<boolean> {
  if (!pool) return true;
  try {
    const catalog = await pool.query('SELECT enabled FROM providers WHERE slug = $1 LIMIT 1', [providerId]);
    if (catalog.rows.length) return Boolean(catalog.rows[0].enabled);
    const result = await pool.query('SELECT enabled FROM provider_configs WHERE provider_key = $1 LIMIT 1', [providerId]);
    return result.rows.length ? Boolean(result.rows[0].enabled) : true;
  } catch (error) {
    // An uninitialized optional catalog must not disable a configured AI provider.
    console.warn('AI_PROVIDER_CONFIG_DB_UNAVAILABLE', JSON.stringify({ provider: providerId, error: error instanceof Error ? error.message : 'unknown_error' }));
    return true;
  }
}

function capabilityFlagsFromStored(value: unknown): CapabilityFlags {
  const names = Array.isArray(value) ? value : [];
  const has = (key: string) => names.includes(key);
  return {
    text: has('text'),
    streaming: has('streaming'),
    vision: has('vision'),
    imageGen: has('imageGen'),
    imageEdit: has('imageEdit'),
    ocr: has('ocr'),
    tts: has('tts'),
    stt: has('stt'),
    tools: has('tools'),
    embedding: has('embedding'),
    webSearch: has('webSearch'),
    webFetch: has('webFetch'),
    jsonMode: has('jsonMode'),
  };
}

async function getStoredModels(providerId: string, forceDisabled = false): Promise<ModelDescriptor[]> {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `SELECT model_key, display_name, COALESCE(capabilities_override, capabilities) AS capabilities, enabled, context_window
         FROM model_catalog WHERE provider_key = $1 ORDER BY display_name`,
      [providerId],
    );
    return result.rows.map((row) => ({
      id: row.model_key,
      providerId,
      displayName: row.display_name || row.model_key,
      description: 'Previously discovered model. The provider could not be reached for a fresh catalog check.',
      contextWindow: Number(row.context_window) || 0,
      capabilities: capabilityFlagsFromStored(row.capabilities),
      enabled: forceDisabled ? false : Boolean(row.enabled),
      verifiedAt: null,
    }));
  } catch {
    console.warn('AI_PROVIDER_STORED_MODELS_UNAVAILABLE', JSON.stringify({ provider: providerId }));
    return [];
  }
}

async function syncDiscoveredModels(provider: ChatProviderAdapter, models: ModelDescriptor[]): Promise<Map<string, boolean>> {
  if (!pool) return new Map(models.map((model) => [model.id, model.enabled]));
  try {
    // Batch catalogue upserts. 9Router can expose thousands of model IDs; one SQL
    // round-trip per model made the first catalogue refresh unnecessarily slow.
    for (let offset = 0; offset < models.length; offset += 200) {
      const batch = models.slice(offset, offset + 200).map((model) => ({
        model_key: model.id,
        display_name: model.displayName,
        capabilities: Object.entries(model.capabilities).filter(([, enabled]) => enabled).map(([key]) => key),
        enabled: provider.id === '9router' ||
          model.id.toLowerCase().endsWith('-free') ||
          (model.pricing?.inputPerMillion === 0 && model.pricing?.outputPerMillion === 0),
        context_window: model.contextWindow,
      }));
      await pool.query(
        `INSERT INTO model_catalog
          (provider_key, model_key, display_name, capabilities, enabled, context_window)
         SELECT $1, rows.model_key, rows.display_name, rows.capabilities, rows.enabled, rows.context_window
           FROM jsonb_to_recordset($2::jsonb) AS rows(
             model_key text, display_name text, capabilities text[], enabled boolean, context_window integer
           )
         ON CONFLICT (provider_key, model_key) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           capabilities = COALESCE(model_catalog.capabilities_override, EXCLUDED.capabilities),
           context_window = EXCLUDED.context_window,
           updated_at = now()`,
        [provider.id, JSON.stringify(batch)],
      );
    }
    const result = await pool.query(
      'SELECT model_key, enabled FROM model_catalog WHERE provider_key = $1',
      [provider.id],
    );
    return new Map(result.rows.map((row) => [row.model_key, Boolean(row.enabled)]));
  } catch (error) {
    console.warn('AI_PROVIDER_MODEL_DB_UNAVAILABLE', JSON.stringify({ provider: provider.id, error: error instanceof Error ? error.message : 'unknown_error' }));
    return new Map(models.map((model) => [model.id, model.enabled]));
  }
}

async function verifyModel(provider: ChatProviderAdapter, model: ModelDescriptor): Promise<ModelDescriptor> {
  // 9Router uses catalogue-only verification (no paid inference probe). The model
  // was just returned by the live catalogue request, so repeating /models once per
  // model is redundant and can issue thousands of identical upstream requests.
  if (provider.id === '9router') {
    // 9Router verification is based on authenticated live catalogue visibility,
    // not a paid inference probe. Persist that verified state just like other providers.
    const checkedAt = new Date().toISOString();
    if (pool) {
      await pool.query(
        `UPDATE model_catalog
            SET verified_at = $3::timestamptz,
                last_health_ok = true,
                health_checked_at = $3::timestamptz,
                updated_at = now()
          WHERE provider_key = $1 AND model_key = $2`,
        [provider.id, model.id, checkedAt],
      ).catch(() => {
        console.warn('AI_PROVIDER_HEALTH_DB_UNAVAILABLE', JSON.stringify({ provider: provider.id, model: model.id }));
      });
    }
    return { ...model, verifiedAt: checkedAt };
  }
  const cacheKey = `${provider.id}:${model.id}`;
  const cached = healthCache.get(cacheKey);
  const isRecent = cached && Date.now() - Date.parse(cached.checkedAt) <= HEALTH_TTL_MS;
  let health: { healthy: boolean; checkedAt: string };
  if (isRecent) {
    health = cached;
  } else {
    let result: { healthy: boolean; checkedAt: string };
    try {
      result = await provider.healthCheck(model.id);
    } catch (error) {
      console.error('AI_PROVIDER_HEALTH_CHECK_ERROR', JSON.stringify({ provider: provider.id, model: model.id, error: error instanceof Error ? error.message : 'unknown_error' }));
      result = { healthy: false, checkedAt: new Date().toISOString() };
    }
    health = { healthy: result.healthy, checkedAt: result.checkedAt };
    healthCache.set(cacheKey, health);
    if (pool) {
      await pool.query(
        `UPDATE model_catalog
            SET verified_at = CASE WHEN $3 THEN $2::timestamptz ELSE NULL END,
                last_health_ok = $3,
                health_checked_at = $2::timestamptz,
                updated_at = now()
          WHERE provider_key = $1 AND model_key = $4`,
        [provider.id, result.checkedAt, result.healthy, model.id],
      ).catch(() => {
        console.warn('AI_PROVIDER_HEALTH_DB_UNAVAILABLE', JSON.stringify({ provider: provider.id, model: model.id }));
      });
    }
  }
  return { ...model, verifiedAt: health.healthy ? health.checkedAt : null };
}

export function invalidateProviderHealth(providerId:string):void{
  for(const key of healthCache.keys())if(key.startsWith(providerId+':'))healthCache.delete(key);
}

export async function recordModelHealthResult(providerId:string,modelId:string,healthy:boolean,checkedAt=new Date().toISOString()):Promise<void>{
  healthCache.set(`${providerId}:${modelId}`,{healthy,checkedAt});
  if(!pool)return;
  await pool.query(`UPDATE model_catalog SET last_health_ok=$3,verified_at=CASE WHEN $3 THEN $4::timestamptz ELSE NULL END,
    health_checked_at=$4::timestamptz,updated_at=now() WHERE provider_key=$1 AND model_key=$2`,
    [providerId,modelId,healthy,checkedAt]);
}

async function applyCapabilityOverrides(providerId: string, models: ModelDescriptor[]): Promise<ModelDescriptor[]> {
  if (!pool || !models.length) return models;
  let result;
  try {
    result = await pool.query(
      'SELECT model_key, capabilities_override FROM model_catalog WHERE provider_key=$1 AND capabilities_override IS NOT NULL',
      [providerId],
    );
  } catch {
    console.warn('AI_PROVIDER_CAPABILITY_OVERRIDES_UNAVAILABLE', JSON.stringify({ provider: providerId }));
    return models;
  }
  const overrides = new Map(result.rows.map((row) => [row.model_key, row.capabilities_override as string[]]));
  return models.map((model) => {
    const override = overrides.get(model.id);
    if (!override) return model;
    const selected = new Set(override);
    return { ...model, capabilities: Object.fromEntries(
      Object.keys(model.capabilities).map((key) => [key, selected.has(key)]),
    ) as unknown as CapabilityFlags };
  });
}

export async function getVerifiedModelDescriptors(): Promise<ModelDescriptor[]> {
  await refreshDatabaseProviderAdapters();
  const verified: ModelDescriptor[] = [];
  const configuredAllowlist = (process.env.AFG_AI_PROVIDER_ALLOWLIST || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const allowlist = configuredAllowlist.length ? new Set(configuredAllowlist) : null;
  for (const provider of allProviderAdapters()) {
    // An explicit allowlist isolates inference and hides all non-allowed providers.
    if (allowlist && !allowlist.has(provider.id.toLowerCase())) continue;
    let configValid = false;
    try { configValid = (await provider.validateConfig()).valid; } catch { configValid = false; }
    let providerEnabled = true;
    try { providerEnabled = await isProviderEnabled(provider.id); } catch { providerEnabled = true; }

    if (!configValid || !providerEnabled) {
      console.warn('AI_PROVIDER_NOT_READY', JSON.stringify({ provider: provider.id, configured: configValid, enabled: providerEnabled }));
      verified.push(...await getStoredModels(provider.id, !providerEnabled));
      continue;
    }

    let models: ModelDescriptor[];
    try {
      models = await provider.listModels();
    } catch (error) {
      console.error('AI_PROVIDER_MODEL_CATALOG_ERROR', JSON.stringify({ provider: provider.id, error: error instanceof Error ? error.message : 'unknown_error' }));
      verified.push(...await getStoredModels(provider.id));
      continue;
    }

    try {
      const enabledModels = await syncDiscoveredModels(provider, models);
      const withOverrides = await applyCapabilityOverrides(provider.id, models);
      const liveIds = new Set(models.map((model) => model.id));
      // Keep administrator-registered catalogue entries alongside the live upstream
      // catalogue. They remain non-selectable until their own health probe succeeds.
      const storedOnly = (await getStoredModels(provider.id)).filter((model) => !liveIds.has(model.id));
      const configuredModels = [
        ...withOverrides.map((model) => ({
          ...model,
          enabled: enabledModels.get(model.id) ?? false,
        })),
        ...storedOnly,
      ];
      for (let i = 0; i < configuredModels.length; i += 4) {
        const batch = configuredModels.slice(i, i + 4);
        verified.push(...await Promise.all(batch.map((model) => model.enabled ? verifyModel(provider, model) : Promise.resolve({ ...model, verifiedAt: null }))));
      }
    } catch (error) {
      console.error('AI_PROVIDER_MODEL_SYNC_ERROR', JSON.stringify({ provider: provider.id, error: error instanceof Error ? error.message : 'unknown_error' }));
      verified.push(...await getStoredModels(provider.id));
    }
  }
  return verified;
}

function isRecentAndHealthy(model: ModelDescriptor): boolean {
  return model.enabled && model.verifiedAt !== null &&
    Date.now() - Date.parse(model.verifiedAt) <= HEALTH_TTL_MS;
}

export async function getConfiguredFallbackModelIds(capability: keyof CapabilityFlags = 'text'): Promise<string[]> {
  if (!pool) return [];
  try {
    const result = await pool.query(
      'SELECT ordered_models FROM provider_fallback_chains WHERE capability = $1 LIMIT 1',
      [capability],
    );
    const ordered = result.rows[0]?.ordered_models;
    if (!Array.isArray(ordered)) return [];
    return ordered.filter((modelId): modelId is string =>
      typeof modelId === 'string' && /^[a-zA-Z0-9._-]{1,100}::[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/.test(modelId),
    );
  } catch (error) {
    console.warn('AI_MODEL_FALLBACK_POLICY_UNAVAILABLE', JSON.stringify({
      capability,
      error: error instanceof Error ? error.message : 'unknown_error',
    }));
    return [];
  }
}

export async function selectCheapestModel(capability: keyof CapabilityFlags = 'text', preferFallback = false): Promise<string | null> {
  const descriptors = await getVerifiedModelDescriptors();
  const capable = descriptors.filter((model) =>
    isRecentAndHealthy(model) && model.capabilities[capability],
  );
  if (!capable.length) return null;

  if (pool) {
    try {
      const fallback = await pool.query(
        'SELECT ordered_models FROM provider_fallback_chains WHERE capability = $1 LIMIT 1',
        [capability],
      );
      const ordered = Array.isArray(fallback.rows[0]?.ordered_models) ? fallback.rows[0].ordered_models as string[] : [];
      const chooseFallback = () => ordered.find((modelId) => capable.some((model) => model.providerId + '::' + model.id === modelId)) || null;
      if (preferFallback) {
        const fallbackModel = chooseFallback();
        if (fallbackModel) return fallbackModel;
      }

      const costs = await pool.query(
        `SELECT provider_key, model_key, input_cost_per_million, output_cost_per_million
           FROM model_catalog WHERE enabled = true`,
      );
      const costById = new Map<string, number>();
      for (const row of costs.rows) {
        if (row.input_cost_per_million !== null && row.output_cost_per_million !== null) {
          costById.set(row.provider_key + '::' + row.model_key, Number(row.input_cost_per_million) + Number(row.output_cost_per_million));
        }
      }
      const priced = capable.filter((model) => costById.has(model.providerId + '::' + model.id))
        .sort((a, b) => (costById.get(a.providerId + '::' + a.id) || 0) - (costById.get(b.providerId + '::' + b.id) || 0));
      if (priced.length) return priced[0].providerId + '::' + priced[0].id;
      return chooseFallback() || (capable[0] ? capable[0].providerId + '::' + capable[0].id : null);
    } catch (error) {
      console.warn('AI_MODEL_FALLBACK_DB_UNAVAILABLE', JSON.stringify({ error: error instanceof Error ? error.message : 'unknown_error' }));
    }
  }

  // No database means no stored prices/fallback chain; choose a healthy deterministic default without claiming it is cheapest.
  return capable[0] ? capable[0].providerId + '::' + capable[0].id : null;
}

export async function getVerifiedProviderCatalog(): Promise<ProviderCatalog> {
  try {
    const descriptors = await getVerifiedModelDescriptors();
    const selectable = descriptors.filter((model) =>
      isRecentAndHealthy(model) && model.capabilities.text && model.capabilities.streaming,
    );
    return {
      status: selectable.length ? 200 : 503,
      verified: selectable.length > 0,
      models: selectable.map((model) => ({
        id: model.providerId + '::' + model.id,
        displayName: model.displayName,
        capabilities: ['chat'],
      })),
      checkedAt: new Date().toISOString(),
      ...(selectable.length ? {} : { error: 'Provider not reachable.' }),
    };
  } catch {
    return { status: 503, verified: false, models: [], error: 'Provider not reachable.' };
  }
}

async function isFeatureFlagEnabled(key:string, fallback=false):Promise<boolean>{
  if(!pool)return fallback;
  try{
    const result=await pool.query('SELECT enabled FROM feature_flags WHERE flag_key=$1 LIMIT 1',[key]);
    return result.rows[0]?Boolean(result.rows[0].enabled):fallback;
  }catch{return false;}
}

export async function getImageStudioSnapshot() {
  if(!(await isFeatureFlagEnabled('image_generation_enabled',false)))return {available:false,providers:[],message:'Image generation is disabled by the administrator.'};
  const descriptors = await getVerifiedModelDescriptors();
  const providers = descriptors.filter((model) =>
    isRecentAndHealthy(model) && model.capabilities.imageGen &&
    Boolean(getProviderAdapter(model.providerId)?.generateImage),
  ).map((model) => {
    const adapter = getProviderAdapter(model.providerId)!;
    const options = adapter.imageGenerationOptions?.(model.id);
    return options ? {
      providerId: model.providerId,
      modelId: model.id,
      displayName: model.displayName,
      stylePresets: options.stylePresets,
      aspectRatios: options.aspectRatios,
      qualityLevels: options.qualityLevels,
      imageEdit: model.capabilities.imageEdit && Boolean(adapter.editImage),
    } : null;
  }).filter(Boolean);
  return {
    available: providers.length > 0,
    providers,
    message: providers.length ? null : 'No verified image-generation provider with declared options is available.',
  };
}

export async function getFileAssistantSnapshot() {
  return {
    available: false,
    storageConfigured: false,
    extractionReady: false,
    virusScannerReady: false,
    plannedFormats: ['PDF', 'TXT', 'DOCX', 'CSV', 'XLSX', 'JSON', 'source files', 'images'],
    message: 'File processing is disabled until private object storage, file extraction, malware scanning and per-user quota enforcement are implemented and configured.',
  };
}

export async function getCapabilitySnapshot() {
  const descriptors = await getVerifiedModelDescriptors();
  const selectable = descriptors.filter(isRecentAndHealthy);
  const [chatEnabled,researchEnabled,voiceEnabled,imageGenerationEnabled] = await Promise.all([
    isFeatureFlagEnabled('chat',true),
    isFeatureFlagEnabled('web_research_enabled',false),
    isFeatureFlagEnabled('voice_enabled',false),
    isFeatureFlagEnabled('image_generation_enabled',false),
  ]);
  const capabilities: Record<AfgCapability, boolean> = {
    chat: chatEnabled && selectable.some((model) => model.capabilities.text && model.capabilities.streaming),
    vision: selectable.some((model) => model.capabilities.vision && Boolean(getProviderAdapter(model.providerId)?.analyzeImage)),
    ocr: selectable.some((model) => model.capabilities.ocr && Boolean(getProviderAdapter(model.providerId)?.analyzeImage)),
    'image-edit': selectable.some((model) => model.capabilities.imageEdit && Boolean(getProviderAdapter(model.providerId)?.editImage)),
    'image-generation': imageGenerationEnabled && selectable.some((model) => model.capabilities.imageGen && Boolean(getProviderAdapter(model.providerId)?.generateImage)),
    'video-generation': false,
    'file-processing': false,
    'speech-to-text': voiceEnabled && selectable.some((model) => model.capabilities.stt && Boolean(getProviderAdapter(model.providerId)?.transcribe)),
    'text-to-speech': voiceEnabled && selectable.some((model) => model.capabilities.tts && Boolean(getProviderAdapter(model.providerId)?.synthesize)),
    research: researchEnabled && Boolean(process.env.TAVILY_API_KEY),
  };

  return {
    models: selectable.filter((model) => model.capabilities.text && model.capabilities.streaming).map((model) => model.providerId + '::' + model.id),
    modelDescriptors: descriptors.map((model) => ({
      ...model,
      selectable: isRecentAndHealthy(model) && ((model.capabilities.text && model.capabilities.streaming) || model.capabilities.imageGen),
      disabledReason: !model.enabled ? 'Disabled by administrator.' :
        (!model.verifiedAt ? 'Provider not reachable.' :
          (!model.capabilities.imageGen && (!model.capabilities.text || !model.capabilities.streaming) ? 'This model does not support chat or image generation.' : null)),
    })),
    verified: capabilities.chat,
    checkedAt: new Date().toISOString(),
    providers: getProviderRegistry().map((provider) => {
      const providerModels = selectable.filter((model) => model.providerId === provider.id);
      return {
        id: provider.id,
        displayName: provider.displayName,
        status: providerModels.some((model) => model.capabilities.text && model.capabilities.streaming) ? 'verified' : 'unavailable',
        capabilities: [...new Set(providerModels.flatMap((model) => Object.entries(model.capabilities).filter(([, enabled]) => enabled).map(([key]) => key)))],
      };
    }),
    capabilities,
  };
}
