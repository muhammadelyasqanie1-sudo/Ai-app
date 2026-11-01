import { getProviderAdapter, getVerifiedModelDescriptors, selectCheapestModel } from './providerGateway.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';
import type { ChatInput, ModelDescriptor } from '../providers/providerTypes.ts';

const HEALTH_MAX_AGE_MS = 5 * 60 * 1000;

function estimateTokens(messages: ChatInput['messages']): number {
  return Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 4);
}

function compactOlderContext(messages: ChatInput['messages'], contextWindow: number): ChatInput['messages'] {
  const system = messages.filter((message) => message.role === 'system');
  const conversation = messages.filter((message) => message.role !== 'system');
  const configuredBudget = Number(process.env.AFG_UNKNOWN_CONTEXT_BUDGET || 8192);
  const budget = contextWindow > 0
    ? Math.max(1024, Math.floor(contextWindow * 0.8))
    : Math.max(1024, Math.min(16_000, Number.isFinite(configuredBudget) ? configuredBudget : 8192));

  if (estimateTokens(messages) <= budget) return messages;

  const recent: typeof conversation = [];
  let used = estimateTokens(system);
  for (let i = conversation.length - 1; i >= 0; i--) {
    const candidate = conversation[i];
    const cost = estimateTokens([candidate]);
    if (used + cost > Math.floor(budget * 0.72)) break;
    recent.unshift(candidate);
    used += cost;
  }

  const retainedCount = recent.length;
  const older = conversation.slice(0, Math.max(0, conversation.length - retainedCount));
  const summaryLines = older.map((message) => {
    const excerpt = message.content.replace(/\s+/g, ' ').trim().slice(0, 320);
    return `- ${message.role}: ${excerpt}`;
  }).filter((line) => line.length > 4).slice(-30);
  const summary = summaryLines.join('\n').slice(0, 6_000);

  const output: ChatInput['messages'] = [...system];
  if (summary) {
    output.push({
      role: 'system',
      content: 'Extractive summary of earlier conversation (abridged excerpts, not a complete transcript). Treat it as context, and ask the user if an omitted detail is important:\n' + summary,
    });
  }
  output.push(...recent);
  return output;
}

function verified(model: ModelDescriptor | undefined): model is ModelDescriptor {
  return Boolean(model && model.enabled && model.verifiedAt &&
    Date.now() - Date.parse(model.verifiedAt) <= HEALTH_MAX_AGE_MS &&
    model.capabilities.text && model.capabilities.streaming);
}

export async function prepareVerifiedChat(input: ChatInput): Promise<AsyncIterable<{ content: string }>> {
  const descriptors = await getVerifiedModelDescriptors();
  let selected = descriptors.find((model) => model.id === input.model && verified(model));

  // If the manually selected model is unavailable, use the administrator's healthy fallback order.
  if (!selected) {
    const fallbackId = await selectCheapestModel('text');
    selected = descriptors.find((model) => model.id === fallbackId && verified(model));
  }

  if (!selected) {
    throw new ProviderAdapterError('Provider not reachable. No enabled, healthy text model is available.', 503, 'model_not_verified');
  }

  const provider = getProviderAdapter(selected.providerId);
  if (!provider) throw new ProviderAdapterError('The selected provider is not registered.', 503, 'provider_not_registered');

  const messages = compactOlderContext(input.messages, selected.contextWindow);
  return provider.streamChat({ ...input, model: selected.id, messages });
}
