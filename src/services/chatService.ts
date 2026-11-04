import { getConfiguredFallbackModelIds, getProviderAdapter, getVerifiedModelDescriptors, selectCheapestModel } from './providerGateway.ts';
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
  const latestMessage = conversation[conversation.length - 1];
  if (latestMessage?.role === 'user') {
    const latestCost = estimateTokens([latestMessage]);
    if (used + latestCost > budget) {
      throw new ProviderAdapterError(
        'Your latest message is larger than this model context window. Shorten the message and retry; it was not silently truncated.',
        413,
        'latest_message_exceeds_context',
      );
    }
    recent.unshift(latestMessage);
    used += latestCost;
  }

  for (let i = conversation.length - 2; i >= 0; i--) {
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


function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new Error('aborted')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function* reliableStream(candidates: ModelDescriptor[], input: ChatInput): AsyncIterable<{ content: string }> {
  let lastError: unknown;
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    const provider = getProviderAdapter(candidate.providerId);
    if (!provider) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      await input.onModelSelected?.(candidate.providerId, candidate.id);
      if (input.signal?.aborted) throw new ProviderAdapterError('The request was cancelled.', 499, 'request_aborted');
      let emitted = false;
      try {
        const stream = provider.streamChat({ ...input, model: candidate.id, messages: compactOlderContext(input.messages, candidate.contextWindow) });
        for await (const chunk of stream) {
          if (chunk.content) emitted = true;
          yield chunk;
        }
        if (!emitted) throw new ProviderAdapterError('The provider returned an empty response.', 502, 'empty_response');
        return;
      } catch (error) {
        lastError = error;
        // Never replay a partially delivered answer: it would duplicate text in the UI.
        if (emitted || input.signal?.aborted) throw error;
        const retryable = !(error instanceof ProviderAdapterError) ||
          error.status === 429 || error.status >= 500 ||
          /unreachable|timeout|network|temporar|stream_interrupted/i.test(error.code);
        if (!retryable) break;
        if (attempt < 2) {
          const base = 350 * (2 ** attempt);
          await waitWithAbort(base + Math.floor(Math.random() * Math.max(1, base * 0.35)), input.signal);
        }
      }
    }
    if (input.noFallback) break;
  }
  if (lastError instanceof ProviderAdapterError) throw lastError;
  throw new ProviderAdapterError('No healthy model could complete the request.', 503, 'model_unavailable');
}

export async function prepareVerifiedChat(input: ChatInput): Promise<{ providerId: string; modelId: string; stream: AsyncIterable<{ content: string }> }> {
  const descriptors = await getVerifiedModelDescriptors();
  const separator = input.model.indexOf('::');
  const requestedProviderId = separator >= 0 ? input.model.slice(0, separator) : '';
  const requestedModelId = separator >= 0 ? input.model.slice(separator + 2) : input.model;
  let selected: ModelDescriptor | undefined;
  if (input.model === 'auto') {
    const automaticId = await selectCheapestModel('text', false);
    if (automaticId) {
      const split = automaticId.indexOf('::');
      const automaticProvider = split >= 0 ? automaticId.slice(0, split) : '';
      const automaticModel = split >= 0 ? automaticId.slice(split + 2) : automaticId;
      selected = descriptors.find((model) =>
        model.id === automaticModel && (!automaticProvider || model.providerId === automaticProvider) && verified(model),
      );
    }
  } else {
    selected = descriptors.find((model) =>
      model.id === requestedModelId && (!requestedProviderId || model.providerId === requestedProviderId) && verified(model),
    );
    if (!selected) {
      throw new ProviderAdapterError(
        'The selected model is unavailable or not currently verified. Choose another model or select Auto; AFG AI will not silently replace a manually selected model.',
        503,
        'selected_model_unavailable',
      );
    }
  }

  if (!selected) {
    throw new ProviderAdapterError('Provider not reachable. No enabled, healthy text model is available.', 503, 'model_not_verified');
  }

  const provider = getProviderAdapter(selected.providerId);
  if (!provider) throw new ProviderAdapterError('The selected provider is not registered.', 503, 'provider_not_registered');

  // Manual model selection is pinned: neither a different model nor another provider may
  // be substituted. Auto mode may use only the administrator-configured fallback chain.
  const fallbackIds = input.model === 'auto' && !input.noFallback
    ? await getConfiguredFallbackModelIds('text')
    : [];
  const configuredFallbacks = fallbackIds
    .map((fallbackId) => {
      const split = fallbackId.indexOf('::');
      if (split < 1) return undefined;
      const providerId = fallbackId.slice(0, split);
      const modelId = fallbackId.slice(split + 2);
      return descriptors.find((model) =>
        model.providerId === providerId && model.id === modelId && verified(model) &&
        model.capabilities.text && model.capabilities.streaming,
      );
    })
    .filter((model): model is ModelDescriptor => Boolean(model));
  const candidates = [
    selected,
    ...configuredFallbacks.filter((model) =>
      model.providerId !== selected!.providerId || model.id !== selected!.id,
    ),
  ];
  const messages = compactOlderContext(input.messages, selected.contextWindow);
  const stream = reliableStream(candidates, { ...input, messages });
  return { providerId: provider.id, modelId: selected.id, stream };
}
