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
    verified: catalog.verified,
    checkedAt: catalog.checkedAt,
    providers: [{
      id: 'cloudflare-workers-ai',
      displayName: 'Cloudflare Workers AI',
      status: catalog.verified ? 'verified' : 'unavailable',
      capabilities: capabilities.chat ? ['chat'] : [],
    }],
    capabilities,
  };
}
