import { cloudflareWorkersAi } from '../providers/cloudflareWorkersAi.ts';
import { createOpenAICompatibleAdapter } from '../providers/openAiCompatible.ts';
import { pool } from '../api/database.ts';
import type { AfgCapability, ChatProviderAdapter, ProviderCatalog, ModelDescriptor, CapabilityFlags } from '../providers/providerTypes.ts';

const openAICompatible = createOpenAICompatibleAdapter();
const providerRegistry: ChatProviderAdapter[] = [cloudflareWorkersAi, ...(openAICompatible ? [openAICompatible] : [])];
const HEALTH_TTL_MS = 5 * 60 * 1000;
const healthCache = new Map<string, { healthy: boolean; checkedAt: string }>();

export function getProviderRegistry(): Array<Pick<ChatProviderAdapter, 'id' | 'key' | 'displayName'>> {
  return providerRegistry.map(({ id, key, displayName }) => ({ id, key, displayName }));
}

export function getProviderAdapter(providerId: string): ChatProviderAdapter | undefined {
  return providerRegistry.find((provider) => provider.id === providerId);
}

export function getChatProvider(): ChatProviderAdapter {
  const provider = providerRegistry.find((candidate) => candidate.id === 'cloudflare-workers-ai');
  if (!provider) throw new Error('No chat provider adapter is registered.');
  return provider;
}

async function isProviderEnabled(providerId: string): Promise<boolean> {
  if (!pool) return true;
  const result = await pool.query('SELECT enabled FROM provider_configs WHERE provider_key = $1 LIMIT 1', [providerId]);
  return result.rows.length ? Boolean(result.rows[0].enabled) : true;
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
         capabilities = EXCLUDED.capabilities,
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
    const result = await provider.healthCheck(model.id);
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
  return { ...model, enabled: model.enabled, verifiedAt: health.healthy ? health.checkedAt : null };
}

export async function getVerifiedModelDescriptors(): Promise<ModelDescriptor[]> {
  const verified: ModelDescriptor[] = [];
  for (const provider of providerRegistry) {
    const config = await provider.validateConfig();
    if (!config.valid || !(await isProviderEnabled(provider.id))) continue;

    const models = await provider.listModels();
    const enabledModels = await syncDiscoveredModels(provider, models);
    const configuredModels = models.map((model) => ({
      ...model,
      enabled: enabledModels.get(model.id) ?? false,
    }));
    for (let i = 0; i < configuredModels.length; i += 4) {
      const batch = configuredModels.slice(i, i + 4);
      verified.push(...await Promise.all(batch.map((model) => verifyModel(provider, model))));
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
    return chooseFallback();
  }

  // With no trustworthy pricing metadata, do not claim a cheapest model.
  return null;
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

export async function getCapabilitySnapshot() {
  const descriptors = await getVerifiedModelDescriptors();
  const selectable = descriptors.filter(isRecentAndHealthy);
  const capabilities: Record<AfgCapability, boolean> = {
    chat: selectable.some((model) => model.capabilities.text && model.capabilities.streaming),
    vision: selectable.some((model) => model.capabilities.vision),
    'image-generation': selectable.some((model) => model.capabilities.imageGen),
    'video-generation': false,
    'file-processing': false,
    'speech-to-text': selectable.some((model) => model.capabilities.stt),
    'text-to-speech': selectable.some((model) => model.capabilities.tts),
    research: false,
  };

  return {
    models: selectable.filter((model) => model.capabilities.text && model.capabilities.streaming).map((model) => model.providerId + '::' + model.id),
    modelDescriptors: descriptors.map((model) => ({
      ...model,
      selectable: isRecentAndHealthy(model),
      disabledReason: !model.enabled ? 'Disabled by administrator.' : (model.verifiedAt !== null ? null : 'Provider not reachable.'),
    })),
    verified: capabilities.chat,
    checkedAt: new Date().toISOString(),
    providers: getProviderRegistry().map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      status: selectable.some((model) => model.providerId === provider.id) ? 'verified' : 'unavailable',
      capabilities: capabilities.chat && provider.id === 'cloudflare-workers-ai' ? ['chat'] : [],
    })),
    capabilities,
  };
}
