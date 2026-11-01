import { cloudflareWorkersAi } from '../providers/cloudflareWorkersAi.ts';
import type { AfgCapability, ChatProviderAdapter, ProviderCatalog } from '../providers/providerTypes.ts';

const providerRegistry: ChatProviderAdapter[] = [cloudflareWorkersAi];

export function getProviderRegistry(): Array<Pick<ChatProviderAdapter, 'key' | 'displayName'>> {
  return providerRegistry.map(({ key, displayName }) => ({ key, displayName }));
}

export function getChatProvider(): ChatProviderAdapter {
  const provider = providerRegistry.find((candidate) => candidate.key === 'cloudflare-workers-ai');
  if (!provider) throw new Error('No chat provider adapter is registered.');
  return provider;
}

export async function getVerifiedProviderCatalog(): Promise<ProviderCatalog> {
  return getChatProvider().listModels();
}

export async function getCapabilitySnapshot() {
  const catalog = await getVerifiedProviderCatalog();
  const capabilities: Record<AfgCapability, boolean> = {
    chat: catalog.verified && catalog.models.some((model) => model.capabilities.includes('chat')),
    vision: false,
    'image-generation': false,
    'video-generation': false,
    'file-processing': false,
    'speech-to-text': false,
    'text-to-speech': false,
    research: false,
  };

  return {
    models: catalog.models.map((model) => model.id),
    verified: catalog.verified,
    checkedAt: catalog.checkedAt,
    providers: getProviderRegistry().map((provider) => ({
      id: provider.key,
      displayName: provider.displayName,
      status: provider.key === 'cloudflare-workers-ai' && catalog.verified ? 'verified' : 'unavailable',
      capabilities: provider.key === 'cloudflare-workers-ai' && capabilities.chat ? ['chat'] : [],
    })),
    capabilities,
  };
}
