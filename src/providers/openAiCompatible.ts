import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type OpenAIModel = {
  id?: string; name?: string; description?: string; context_length?: number; context_window?: number;
  max_output_tokens?: number; top_provider?: { max_completion_tokens?: number };
  pricing?: { prompt?: string|number; completion?: string|number };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
};
type OpenAIModelsPage = { data?: OpenAIModel[]; has_more?: boolean; last_id?: string };
const CAPABILITIES: CapabilityFlags = {
  text: true, streaming: true, vision: false, imageGen: false, imageEdit: false, ocr: false,
  tts: false, stt: false, tools: false, jsonMode: false,
};

function config() {
  const baseUrl = (process.env.OPENAI_COMPAT_BASE_URL?.trim() || '').replace(/\/+$/, '');
  const apiKey = process.env.OPENAI_COMPAT_API_KEY?.trim() || '';
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

export interface OpenAICompatibleAdapterOptions {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

export function createOpenAICompatibleAdapter(options?: OpenAICompatibleAdapterOptions): ChatProviderAdapter {
  const currentConfig = () => options ? {
    id: options.id, displayName: options.displayName,
    baseUrl: options.baseUrl.replace(/\/+$/, ''), apiKey: options.apiKey,
  } : config();
  const initial = currentConfig();
  return {
    id: initial.id,
    key: initial.id,
    displayName: initial.displayName,

    async validateConfig(): Promise<ConfigStatus> {
      const current = currentConfig();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        return { valid: false, message: 'Set a valid HTTPS OPENAI_COMPAT_BASE_URL and server-side OPENAI_COMPAT_API_KEY.' };
      }
      return { valid: true };
    },

    capabilities(_modelId: string): CapabilityFlags { return { ...CAPABILITIES }; },

    async listModels(): Promise<ModelDescriptor[]> {
      const current = currentConfig();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        throw new ProviderAdapterError('OpenAI-compatible provider is not configured.', 503, 'provider_not_configured');
      }
      try {
        const all: OpenAIModel[] = [];
        let after: string | undefined;
        let pages = 0;
        while (pages++ < 50) {
          const url = new URL(current.baseUrl + '/models');
          url.searchParams.set('limit', '100');
          if (after) url.searchParams.set('after', after);
          const response = await fetch(url, {
            headers: { Authorization: 'Bearer ' + current.apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(15_000), redirect: 'error',
          });
          if (!response.ok) {
            console.error('AI_PROVIDER_MODEL_DISCOVERY_FAILED', JSON.stringify({ provider: current.id, status: response.status }));
            throw new ProviderAdapterError('Provider model discovery failed.', response.status >= 400 && response.status < 500 ? response.status : 502, 'model_catalog_failed');
          }
          const payload = await response.json() as OpenAIModelsPage;
          if (!Array.isArray(payload.data)) throw new ProviderAdapterError('Provider returned an invalid model catalog.', 502, 'invalid_model_catalog');
          all.push(...payload.data);
          if (payload.has_more !== true) break;
          const next = payload.last_id || payload.data[payload.data.length - 1]?.id;
          if (!next || next === after) throw new ProviderAdapterError('Provider pagination did not advance.', 502, 'model_pagination_invalid');
          after = next;
        }
        if (pages > 50) throw new ProviderAdapterError('Provider model catalog exceeded the pagination safety limit.', 502, 'model_catalog_too_large');
        const unique = all.filter((model, index) => typeof model.id === 'string' &&
          /^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/.test(model.id) &&
          all.findIndex((candidate) => candidate.id === model.id) === index);
        return unique.map((model) => {
          const inputModalities = model.architecture?.input_modalities || [];
          const outputModalities = model.architecture?.output_modalities || [];
          const parameters = model.supported_parameters || [];
          const promptPrice = Number(model.pricing?.prompt);
          const completionPrice = Number(model.pricing?.completion);
          return {
            id: model.id as string,
            providerId: current.id,
            displayName: model.name || model.id as string,
            description: model.description || 'Model discovered from the configured provider catalog.',
            contextWindow: Number.isFinite(model.context_window) ? Number(model.context_window) : (Number.isFinite(model.context_length) ? Number(model.context_length) : 0),
            maxOutput: Number(model.max_output_tokens || model.top_provider?.max_completion_tokens || 0) || undefined,
            pricing: {
              inputPerMillion: Number.isFinite(promptPrice) ? promptPrice * 1_000_000 : null,
              outputPerMillion: Number.isFinite(completionPrice) ? completionPrice * 1_000_000 : null,
              currency: 'USD',
            },
            capabilities: {
              text: true, streaming: true,
              vision: inputModalities.includes('image'),
              imageGen: outputModalities.includes('image'),
              imageEdit: false, ocr: false, tts: outputModalities.includes('audio'),
              stt: inputModalities.includes('audio'), tools: parameters.includes('tools'),
              jsonMode: parameters.includes('response_format') || parameters.includes('structured_outputs'),
            },
            enabled: true, verifiedAt: null,
          };
        });
      } catch (error) {
        if (error instanceof ProviderAdapterError) throw error;
        console.error('AI_PROVIDER_MODEL_DISCOVERY_ERROR', JSON.stringify({ provider: current.id, error: error instanceof Error ? error.message : 'unknown_error' }));
        throw new ProviderAdapterError('Could not reach the OpenAI-compatible provider.', 502, 'provider_unreachable');
      }
    },

    async healthCheck(modelId: string): Promise<HealthStatus> {
      const current = currentConfig();
      const checkedAt = new Date().toISOString();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        return { healthy: false, checkedAt, message: 'Provider not reachable.' };
      }
      try {
        // Prove actual inference access with a one-token probe; a models-list
        // endpoint alone does not prove that the selected model can generate.
        const response = await fetch(current.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + current.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 1, stream: false }),
          signal: AbortSignal.timeout(15_000), redirect: 'error',
        });
        if (!response.ok) {
          console.warn('AI_PROVIDER_HEALTH_CHECK_FAILED', JSON.stringify({ provider: current.id, model: modelId, status: response.status }));
          return { healthy: false, checkedAt, message: 'Provider inference probe failed.' };
        }
        const payload = await response.json() as { choices?: unknown[]; error?: unknown };
        return Array.isArray(payload.choices) && payload.choices.length > 0 && !payload.error
          ? { healthy: true, checkedAt }
          : { healthy: false, checkedAt, message: 'Provider inference probe failed.' };
      } catch (error) {
        console.error('AI_PROVIDER_HEALTH_CHECK_ERROR', JSON.stringify({ provider: current.id, model: modelId, error: error instanceof Error ? error.message : 'unknown_error' }));
        return { healthy: false, checkedAt, message: 'Provider not reachable.' };
      }
    },

    async *streamChat(input: ChatRequest): AsyncIterable<ChatChunk> {
      const current = currentConfig();
      if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
        throw new ProviderAdapterError('OpenAI-compatible provider is not configured.', 503, 'provider_not_configured');
      }
      let response: Response;
      try {
        response = await fetch(current.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + current.apiKey, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
          signal: input.signal ? AbortSignal.any([AbortSignal.timeout(90_000), input.signal]) : AbortSignal.timeout(90_000), redirect: 'error',
        });
      } catch (error) {
        console.error('AI_PROVIDER_CHAT_CONNECTION_ERROR', JSON.stringify({ provider: current.id, model: input.model, error: error instanceof Error ? error.message : 'unknown_error' }));
        throw new ProviderAdapterError('Could not contact the OpenAI-compatible provider.', 502, 'provider_unreachable');
      }
      if (!response.ok || !response.body) {
        console.error('AI_PROVIDER_CHAT_REJECTED', JSON.stringify({ provider: current.id, model: input.model, status: response.status }));
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
        buffer += decoder.decode();
        if (buffer.trim()) {
          const dataLine = buffer.split(/\r?\n/).find((line) => line.startsWith('data:'));
          const data = dataLine?.slice(5).trim();
          if (data && data !== '[DONE]') {
            let event: any;
            try { event = JSON.parse(data); } catch { event = null; }
            if (event?.error) throw new ProviderAdapterError('The provider interrupted the response.', 502, 'provider_stream_error');
            const content = event?.choices?.[0]?.delta?.content;
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
