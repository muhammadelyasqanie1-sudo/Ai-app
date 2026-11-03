import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type OpenAIModel = { id?: string; name?: string; description?: string; context_length?: number; context_window?: number };
const CAPABILITIES: CapabilityFlags = {
  text: true, streaming: true, vision: false, imageGen: false, imageEdit: false, ocr: false,
  tts: false, stt: false, tools: false, jsonMode: false,
};

type OpenAICompatibleOptions = {
  envPrefix?: string;
  defaultId?: string;
  defaultDisplayName?: string;
  healthByCatalog?: boolean;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
};

export function createOpenAICompatibleAdapter(options: OpenAICompatibleOptions = {}): ChatProviderAdapter {
  const prefix = options.envPrefix || 'OPENAI_COMPAT';
  function config() {
    const geminiKey = prefix === 'OPENAI_COMPAT' ? process.env.GEMINI_API_KEY?.trim() : undefined;
    const baseUrl = (process.env[`${prefix}_BASE_URL`]?.trim() ||
      (geminiKey ? 'https://generativelanguage.googleapis.com/v1beta/openai' : '')).replace(/\\/+$/, '');
    const apiKey = process.env[`${prefix}_API_KEY`]?.trim() || geminiKey;
    const id = process.env[`${prefix}_PROVIDER_ID`]?.trim() || (geminiKey ? 'gemini-openai-compatible' : (options.defaultId || 'openai-compatible'));
    const displayName = process.env[`${prefix}_DISPLAY_NAME`]?.trim() || (geminiKey ? 'Google Gemini' : (options.defaultDisplayName || 'OpenAI-compatible provider'));
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
        if (!response.ok) {
          console.error('AI_PROVIDER_MODEL_DISCOVERY_FAILED', JSON.stringify({ provider: current.id, status: response.status }));
          throw new ProviderAdapterError('Provider model discovery failed.', response.status >= 400 && response.status < 500 ? response.status : 502, 'model_catalog_failed');
        }
        const payload = await response.json() as { data?: OpenAIModel[] };
        if (!Array.isArray(payload.data)) throw new ProviderAdapterError('Provider returned an invalid model catalog.', 502, 'invalid_model_catalog');
        const geminiChatModels = new Set(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
        const listedModels = payload.data.filter((model) => typeof model.id === 'string' && /^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/.test(model.id));
        // Gemini exposes many modalities and preview endpoints through /models. Keep the
        // chat catalog to Google's currently recommended stable text models to avoid
        // presenting image/audio/retired models as chat choices.
        const usableModels = current.id === 'gemini-openai-compatible'
          ? listedModels.filter((model) => geminiChatModels.has(model.id || ''))
          : listedModels;
        return usableModels
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
        console.error('AI_PROVIDER_MODEL_DISCOVERY_ERROR', JSON.stringify({ provider: current.id, error: error instanceof Error ? error.message : 'unknown_error' }));
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
        // Validate model access without generating tokens. A completion-based health
        // probe consumes quota and can rate-limit the real user's first chat request.
        const response = await fetch(
          options.healthByCatalog ? current.baseUrl + '/models' : current.baseUrl + '/models/' + encodeURIComponent(modelId),
          {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + current.apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(12_000),
          },
        );
        if (!response.ok) {
          console.warn('AI_PROVIDER_HEALTH_CHECK_FAILED', JSON.stringify({ provider: current.id, model: modelId, status: response.status }));
          return { healthy: false, checkedAt, message: 'Provider not reachable.' };
        }
        const payload = await response.json() as { id?: string; object?: string; error?: unknown; data?: Array<{ id?: string }> };
        const catalogContainsModel = Array.isArray(payload.data) && payload.data.some((item) => item.id === modelId);
        const healthy = options.healthByCatalog
          ? catalogContainsModel
          : typeof payload.id === 'string' && !payload.error;
        return healthy
          ? { healthy: true, checkedAt }
          : { healthy: false, checkedAt, message: 'Provider not reachable.' };
      } catch (error) {
        console.error('AI_PROVIDER_HEALTH_CHECK_ERROR', JSON.stringify({ provider: current.id, model: modelId, error: error instanceof Error ? error.message : 'unknown_error' }));
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
          headers: {
            Authorization: 'Bearer ' + current.apiKey,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(options.reasoningEffort ? { 'X-Reasoning-Effort': options.reasoningEffort, 'X-Show-Reasoning': 'false' } : {}),
          },
          body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
          signal: input.signal ? AbortSignal.any([AbortSignal.timeout(90_000), input.signal]) : AbortSignal.timeout(90_000),
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
