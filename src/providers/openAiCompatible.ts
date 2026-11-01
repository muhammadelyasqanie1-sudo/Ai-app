import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type OpenAIModel = { id?: string; name?: string; description?: string; context_length?: number; context_window?: number };
const CAPABILITIES: CapabilityFlags = {
  text: true, streaming: true, vision: false, imageGen: false,
  tts: false, stt: false, tools: false, jsonMode: false,
};

function config() {
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL?.trim().replace(/\/+$/, '');
  const apiKey = process.env.OPENAI_COMPAT_API_KEY?.trim();
  const id = process.env.OPENAI_COMPAT_PROVIDER_ID?.trim() || 'openai-compatible';
  const displayName = process.env.OPENAI_COMPAT_DISPLAY_NAME?.trim() || 'OpenAI-compatible provider';
  return { baseUrl, apiKey, id, displayName };
}

function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:');
  } catch { return false; }
}

export function createOpenAICompatibleAdapter(): ChatProviderAdapter {
  const initial = config();
  return {
    id: initial.id,
    key: initial.id,
    displayName: initial.displayName,

    async validateConfig(): Promise<ConfigStatus> {
      const current = config();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        return { valid: false, message: 'Set a valid HTTPS OPENAI_COMPAT_BASE_URL and server-side OPENAI_COMPAT_API_KEY.' };
      }
      return { valid: true };
    },

    capabilities(_modelId: string): CapabilityFlags { return { ...CAPABILITIES }; },

    async listModels(): Promise<ModelDescriptor[]> {
      const current = config();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        throw new ProviderAdapterError('OpenAI-compatible provider is not configured.', 503, 'provider_not_configured');
      }
      try {
        const response = await fetch(current.baseUrl + '/models', {
          headers: { Authorization: 'Bearer ' + current.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new ProviderAdapterError('Provider model discovery failed.', 502, 'model_catalog_failed');
        const payload = await response.json() as { data?: OpenAIModel[] };
        if (!Array.isArray(payload.data)) throw new ProviderAdapterError('Provider returned an invalid model catalog.', 502, 'invalid_model_catalog');
        return payload.data.filter((model) => typeof model.id === 'string' && /^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/.test(model.id))
          .map((model) => ({
            id: model.id as string,
            providerId: current.id,
            displayName: model.name || model.id as string,
            description: model.description || 'Model discovered from the configured OpenAI-compatible provider.',
            contextWindow: Number.isFinite(model.context_window) ? Number(model.context_window) : (Number.isFinite(model.context_length) ? Number(model.context_length) : 0),
            capabilities: this.capabilities(model.id as string),
            enabled: true,
            verifiedAt: null,
          }));
      } catch (error) {
        if (error instanceof ProviderAdapterError) throw error;
        throw new ProviderAdapterError('Could not reach the OpenAI-compatible provider.', 502, 'provider_unreachable');
      }
    },

    async healthCheck(modelId: string): Promise<HealthStatus> {
      const current = config();
      const checkedAt = new Date().toISOString();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        return { healthy: false, checkedAt, message: 'Provider not reachable.' };
      }
      try {
        const response = await fetch(current.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + current.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 1, stream: false }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) return { healthy: false, checkedAt, message: 'Provider not reachable.' };
        const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; error?: unknown };
        const content = payload.choices?.[0]?.message?.content;
        return typeof content === 'string' && content.length > 0
          ? { healthy: true, checkedAt }
          : { healthy: false, checkedAt, message: 'Provider not reachable.' };
      } catch {
        return { healthy: false, checkedAt, message: 'Provider not reachable.' };
      }
    },

    async *streamChat(input: ChatRequest): AsyncIterable<ChatChunk> {
      const current = config();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        throw new ProviderAdapterError('OpenAI-compatible provider is not configured.', 503, 'provider_not_configured');
      }
      let response: Response;
      try {
        response = await fetch(current.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + current.apiKey, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
          signal: input.signal ? AbortSignal.any([AbortSignal.timeout(90_000), input.signal]) : AbortSignal.timeout(90_000),
        });
      } catch {
        throw new ProviderAdapterError('Could not contact the OpenAI-compatible provider.', 502, 'provider_unreachable');
      }
      if (!response.ok || !response.body) {
        throw new ProviderAdapterError('The OpenAI-compatible provider rejected the chat request.', response.status >= 400 && response.status < 500 ? response.status : 502, 'provider_request_rejected');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';
          for (const eventText of events) {
            const dataLine = eventText.split(/\r?\n/).find((line) => line.startsWith('data:'));
            if (!dataLine) continue;
            const data = dataLine.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let event: any;
            try { event = JSON.parse(data); } catch { continue; }
            if (event.error) throw new ProviderAdapterError('The provider interrupted the response.', 502, 'provider_stream_error');
            const content = event.choices?.[0]?.delta?.content;
            if (typeof content === 'string' && content) yield { content };
          }
        }
      } catch (error) {
        if (error instanceof ProviderAdapterError) throw error;
        throw new ProviderAdapterError('The provider response stream was interrupted.', 502, 'provider_stream_interrupted');
      } finally { reader.releaseLock(); }
    },
  };
}
