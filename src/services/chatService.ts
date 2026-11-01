import { getChatProvider, getVerifiedModelDescriptors } from './providerGateway.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';
import type { ChatInput } from '../providers/providerTypes.ts';

const HEALTH_MAX_AGE_MS = 5 * 60 * 1000;

export async function prepareVerifiedChat(input: ChatInput): Promise<AsyncIterable<{ content: string }>> {
  const provider = getChatProvider();
  const models = await getVerifiedModelDescriptors();
  const selected = models.find((model) => model.providerId === provider.id && model.id === input.model);
  const isRecent = selected?.verifiedAt
    ? Date.now() - Date.parse(selected.verifiedAt) <= HEALTH_MAX_AGE_MS
    : false;

  if (!selected || !selected.enabled || !isRecent ||
      !selected.capabilities.text || !selected.capabilities.streaming) {
    throw new ProviderAdapterError('Provider not reachable.', 503, 'model_not_verified');
  }

  return provider.streamChat(input);
}
