import { cloudflareWorkersAi } from '../providers/cloudflareWorkersAi.ts';
import type { AfgCapability, ChatProviderAdapter, ProviderCatalog, ModelDescriptor } from '../providers/providerTypes.ts';

const providerRegistry: ChatProviderAdapter[] = [cloudflareWorkersAi];
const HEALTH_TTL_MS = 5 * 60 * 1000;
const healthCache = new Map<string, { healthy: boolean; checkedAt: string }>();

export function getProviderRegistry(): Array<Pick<ChatProviderAdapter, 'id' | 'key' | 'displayName'>> {
  return providerRegistry.map(({ id, key, displayName }) => ({ id, key, displayName }));
}

export function getChatProvider(): ChatProviderAdapter {
  const provider = providerRegistry.find((candidate) => candidate.id === 'cloudflare-workers-ai');
  if (!provider) throw new Error('No chat provider adapter is registered.');
  return provider;
}

async function verifyModel(provider: ChatProviderAdapter, model: ModelDescriptor): Promise<ModelDescriptor> {
  const cacheKey = `${provider.id}:${model.id}`;
  const cached = healthCache.get(cacheKey);
  const isRecent = cached && Date.now() - Date.parse(cached.checkedAt) <= HEALTH_TTL_MS;
  if (isRecent) {
    return { ...model, verifiedAt: cached.healthy ? cached.checkedAt : null };
  }

  const result = await provider.healthCheck(model.id);
  healthCache.set(cacheKey, { healthy: result.healthy, checkedAt: result.checkedAt });
  return { ...model, verifiedAt: result.healthy ? result.checkedAt : null };
}

export async function getVerifiedModelDescriptors(): Promise<ModelDescriptor[]> {
  const verified: ModelDescriptor[] = [];
  for (const provider of providerRegistry) {
    const config = await provider.validateConfig();
    if (!config.valid) continue;

    let models: ModelDescriptor[];
    try {
      models = await provider.listModels();
    } catch {
      continue;
    }

    // Bound probe concurrency to avoid flooding a provider account during catalog refresh.
    const results: ModelDescriptor[] = [];
    for (let i = 0; i < models.length; i += 4) {
      const batch = models.slice(i, i + 4);
      results.push(...await Promise.all(batch.map((model) => verifyModel(provider, model))));
    }
    verified.push(...results);
  }
  return verified;
}

export async function getVerifiedProviderCatalog(): Promise<ProviderCatalog> {
  try {
    const descriptors = await getVerifiedModelDescriptors();
    const selectable = descriptors.filter((model) =>
      model.enabled &&
      model.verifiedAt !== null &&
      Date.now() - Date.parse(model.verifiedAt) <= HEALTH_TTL_MS &&
      model.capabilities.text &&
      model.capabilities.streaming,
    );
    return {
      status: selectable.length ? 200 : 503,
      verified: selectable.length > 0,
      models: selectable.map((model) => ({
        id: model.id,
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
  const selectable = descriptors.filter((model) =>
    model.enabled &&
    model.verifiedAt !== null &&
    Date.now() - Date.parse(model.verifiedAt) <= HEALTH_TTL_MS,
  );
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
    models: selectable.filter((model) => model.capabilities.text && model.capabilities.streaming).map((model) => model.id),
    modelDescriptors: descriptors.map((model) => ({
      ...model,
      selectable: model.enabled && model.verifiedAt !== null &&
        Date.now() - Date.parse(model.verifiedAt) <= HEALTH_TTL_MS,
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
