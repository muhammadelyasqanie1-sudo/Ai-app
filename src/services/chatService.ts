import { getChatProvider } from './providerGateway.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';
import type { ChatInput } from '../providers/providerTypes.ts';

export async function prepareVerifiedChat(input: ChatInput): Promise<AsyncGenerator<string, void, void>> {
  const provider = getChatProvider();
  const catalog = await provider.listModels();

  if (!catalog.verified) {
    throw new ProviderAdapterError(
      catalog.error || 'The AI provider is currently unavailable.',
      catalog.status || 503,
      'model_catalog_unverified',
    );
  }
  if (!catalog.models.some((model) => model.id === input.model && model.capabilities.includes('chat'))) {
    throw new ProviderAdapterError(
      'This model is not currently verified as available for chat. Refresh the model list.',
      400,
      'model_not_verified',
    );
  }

  return provider.streamChat(input);
}
