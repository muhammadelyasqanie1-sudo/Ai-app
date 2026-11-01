import { cloudflareWorkersAi } from '../providers/cloudflareWorkersAi.ts';
import { createOpenAICompatibleAdapter } from '../providers/openAiCompatible.ts';
import { pool } from '../api/database.ts';
import type { AfgCapability, ChatProviderAdapter, ProviderCatalog, ModelDescriptor, CapabilityFlags } from '../providers/providerTypes.ts';

const openAICompatible = createOpenAICompatibleAdapter();
const providerRegistry: ChatProviderAdapter[] = [cloudflareWorkersAi, openAICompatible];
const HEALTH_TTL_MS = 5 * 60 * 1000;
const healthCache = new Map<string, { healthy: boolean; checkedAt: string }>();

export function getProviderRegistry(): Array<Pick<ChatProviderAdapter, 'id' | 'key' | 'displayName'>> {
  return providerRegistry.map(({ id, key, displayName }) => ({ id, key, displayName }));
}

export function getProviderAdapter(providerId: string): ChatProviderAdapter | undefined {
  return providerRegistry.find((provider) => provider.id === providerId);
}

async function isProviderEnabled(providerId: string): Promise<boolean> {
  if (!pool) return true;
  const result = await pool.query('SELECT enabled FROM provider_configs WHERE provider_key = $1 LIMIT 1', [providerId]);
  return result.rows.length ? Boolean(result.rows[0].enabled) : true;
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
    jsonMode: has('jsonMode'),
  };
}

async function getStoredModels(providerId: string, forceDisabled = false): Promise<ModelDescriptor[]> {
  if (!pool) return [];
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
}

async function syncDiscoveredModels(provider: ChatProviderAdapter, models: ModelDescriptor[]): Promise<Map<string, boolean>> {
  if (!pool) return new Map(models.map((model) => [model.id, model.enabled]));
  for (const model of models) {
    await pool.query(
      `INSERT INTO model_catalog
        (provider_key, model_key, display_name, capabilities, enabled, context_window)
       VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (provider_key, model_key) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         capabilities = COALESCE(model_catalog.capabilities_override, EXCLUDED.capabilities),
         context_window = EXCLUDED.context_window,
         updated_at = now()`,
      [provider.id, model.id, model.displayName,
        Object.entries(model.capabilities).filter(([, enabled]) => enabled).map(([key]) => key),
        model.contextWindow],
    );
  }
  const result = await pool.query(
    'SELECT model_key, enabled FROM model_catalog WHERE provider_key = $1',
    [provider.id],
  );
  return new Map(result.rows.map((row) => [row.model_key, Boolean(row.enabled)]));
}

async function verifyModel(provider: ChatProviderAdapter, model: ModelDescriptor): Promise<ModelDescriptor> {
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
    } catch {
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
      );
    }
  }
  return { ...model, verifiedAt: health.healthy ? health.checkedAt : null };
}

async function applyCapabilityOverrides(providerId: string, models: ModelDescriptor[]): Promise<ModelDescriptor[]> {
  if (!pool || !models.length) return models;
  const result = await pool.query(
    'SELECT model_key, capabilities_override FROM model_catalog WHERE provider_key=$1 AND capabilities_override IS NOT NULL',
    [providerId],
  );
  const overrides = new Map(result.rows.map((row) => [row.model_key, row.capabilities_override as string[]]));
  return models.map((model) => {
    const override = overrides.get(model.id);
    if (!override) return model;
    const selected = new Set(override);
    return { ...model, capabilities: Object.fromEntries(
      Object.keys(model.capabilities).map((key) => [key, selected.has(key)]),
    ) as CapabilityFlags };
  });
}

export async function getVerifiedModelDescriptors(): Promise<ModelDescriptor[]> {
  const verified: ModelDescriptor[] = [];
  for (const provider of providerRegistry) {
    let configValid = false;
    try { configValid = (await provider.validateConfig()).valid; } catch { configValid = false; }
    let providerEnabled = false;
    try { providerEnabled = await isProviderEnabled(provider.id); } catch { providerEnabled = false; }

    if (!configValid || !providerEnabled) {
      verified.push(...await getStoredModels(provider.id, !providerEnabled));
      continue;
    }

    let models: ModelDescriptor[];
    try {
      models = await provider.listModels();
    } catch {
      verified.push(...await getStoredModels(provider.id));
      continue;
    }

    try {
      const enabledModels = await syncDiscoveredModels(provider, models);
      const withOverrides = await applyCapabilityOverrides(provider.id, models);
      const configuredModels = withOverrides.map((model) => ({
        ...model,
        enabled: enabledModels.get(model.id) ?? false,
      }));
      for (let i = 0; i < configuredModels.length; i += 4) {
        const batch = configuredModels.slice(i, i + 4);
        verified.push(...await Promise.all(batch.map((model) => model.enabled ? verifyModel(provider, model) : Promise.resolve({ ...model, verifiedAt: null }))));
      }
    } catch {
      verified.push(...await getStoredModels(provider.id));
    }
  }
  return verified;
}

function isRecentAndHealthy(model: ModelDescriptor): boolean {
  return model.enabled && model.verifiedAt !== null &&
    Date.now() - Date.parse(model.verifiedAt) <= HEALTH_TTL_MS;
}

export async function selectCheapestModel(capability: keyof CapabilityFlags = 'text', preferFallback = false): Promise<string | null> {
  const descriptors = await getVerifiedModelDescriptors();
  const capable = descriptors.filter((model) =>
    isRecentAndHealthy(model) && model.capabilities[capability],
  );
  if (!capable.length) return null;

  if (pool) {
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

export async function getImageStudioSnapshot() {
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
  const capabilities: Record<AfgCapability, boolean> = {
    chat: selectable.some((model) => model.capabilities.text && model.capabilities.streaming),
    vision: selectable.some((model) => model.capabilities.vision && Boolean(getProviderAdapter(model.providerId)?.analyzeImage)),
    ocr: selectable.some((model) => model.capabilities.ocr && Boolean(getProviderAdapter(model.providerId)?.analyzeImage)),
    'image-edit': selectable.some((model) => model.capabilities.imageEdit && Boolean(getProviderAdapter(model.providerId)?.editImage)),
    'image-generation': selectable.some((model) => model.capabilities.imageGen && Boolean(getProviderAdapter(model.providerId)?.generateImage)),
    'video-generation': false,
    'file-processing': false,
    'speech-to-text': selectable.some((model) => model.capabilities.stt && Boolean(getProviderAdapter(model.providerId)?.transcribe)),
    'text-to-speech': selectable.some((model) => model.capabilities.tts && Boolean(getProviderAdapter(model.providerId)?.synthesize)),
    research: Boolean(process.env.TAVILY_API_KEY),
  };

  return {
    models: selectable.filter((model) => model.capabilities.text && model.capabilities.streaming).map((model) => model.providerId + '::' + model.id),
    modelDescriptors: descriptors.map((model) => ({
      ...model,
      selectable: isRecentAndHealthy(model) && model.capabilities.text && model.capabilities.streaming,
      disabledReason: !model.enabled ? 'Disabled by administrator.' :
        (!model.verifiedAt ? 'Provider not reachable.' :
          (!model.capabilities.text || !model.capabilities.streaming ? 'This model does not support streaming chat.' : null)),
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
