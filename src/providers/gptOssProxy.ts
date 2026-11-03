import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type OpenAIModel = { id?: string; name?: string; description?: string; context_length?: number; context_window?: number };

const CHAT_CAPABILITIES: CapabilityFlags = {
  text: true, streaming: true, vision: false, imageGen: false, imageEdit: false, ocr: false,
  tts: false, stt: false, tools: false, jsonMode: false,
};

function config() {
  return {
    baseUrl: (process.env.GPTOSS_BASE_URL?.trim() || '').replace(/\\/+$/, ''),
    apiKey: process.env.GPTOSS_API_KEY?.trim() || '',
    displayName: process.env.GPTOSS_DISPLAY_NAME?.trim() || 'GPT-OSS Proxy',
  };
}

function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:');
  } catch { return false; }
}

export const gptOssProxy: ChatProviderAdapter = {
  id: 'gpt-oss-proxy',
  key: 'gpt-oss-proxy',
  get displayName() { return config().displayName; },

  async validateConfig(): Promise<ConfigStatus> {
    const current = config();
    return current.baseUrl && current.apiKey && validBaseUrl(current.baseUrl)
      ? { valid: true }
      : { valid: false, message: 'Set GPTOSS_BASE_URL and the server-side GPTOSS_API_KEY.' };
  },

  capabilities(_modelId: string): CapabilityFlags { return { ...CHAT_CAPABILITIES }; },

  async listModels(): Promise<ModelDescriptor[]> {
    const current = config();
    if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
      throw new ProviderAdapterError('GPT-OSS proxy is not configured.', 503, 'provider_not_configured');
    }
    try {
      const response = await fetch(current.baseUrl + '/models', {
        headers: { Authorization: 'Bearer ' + current.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        console.error('GPTOSS_MODEL_DISCOVERY_FAILED', JSON.stringify({ status: response.status }));
        throw new ProviderAdapterError('GPT-OSS model discovery failed.', response.status >= 400 && response.status < 500 ? response.status : 502, 'model_catalog_failed');
      }
      const payload = await response.json() as { data?: OpenAIModel[] };
      if (!Array.isArray(payload.data)) throw new ProviderAdapterError('GPT-OSS proxy returned an invalid model catalog.', 502, 'invalid_model_catalog');
      return payload.data
        .filter((model) => typeof model.id === 'string' && ['gpt-oss-20b', 'gpt-oss-120b'].includes(model.id))
        .map((model) => ({
          id: model.id as string,
          providerId: this.id,
          displayName: model.name || (model.id === 'gpt-oss-120b' ? 'GPT-OSS 120B' : 'GPT-OSS 20B'),
          description: model.description || 'GPT-OSS model served through the secured AFG AI Cloudflare proxy.',
          contextWindow: Number.isFinite(model.context_window) ? Number(model.context_window) : (Number.isFinite(model.context_length) ? Number(model.context_length) : 0),
          capabilities: this.capabilities(model.id as string),
          enabled: true,
          verifiedAt: null,
        }));
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      console.error('GPTOSS_MODEL_DISCOVERY_ERROR', JSON.stringify({ error: error instanceof Error ? error.message : 'unknown_error' }));
      throw new ProviderAdapterError('Could not reach the GPT-OSS proxy.', 502, 'provider_unreachable');
    }
  },

  async healthCheck(modelId: string): Promise<HealthStatus> {
    const current = config();
    const checkedAt = new Date().toISOString();
    if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
      return { healthy: false, checkedAt, message: 'GPT-OSS proxy is not configured.' };
    }
    try {
      // The proxy exposes /models but not /models/{id}; verify the exact model from its catalog.
      const response = await fetch(current.baseUrl + '/models', {
        headers: { Authorization: 'Bearer ' + current.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return { healthy: false, checkedAt, message: 'GPT-OSS proxy is not reachable.' };
      const payload = await response.json() as { data?: Array<{ id?: string }> };
      const healthy = Array.isArray(payload.data) && payload.data.some((model) => model.id === modelId);
      return { healthy, checkedAt, ...(healthy ? {} : { message: 'Model is not present in the proxy catalog.' }) };
    } catch {
      return { healthy: false, checkedAt, message: 'GPT-OSS proxy is not reachable.' };
    }
  },

  async *streamChat(input: ChatRequest): AsyncIterable<ChatChunk> {
    const current = config();
    if (!current.baseUrl || !current.apiKey || !validBaseUrl(current.baseUrl)) {
      throw new ProviderAdapterError('GPT-OSS proxy is not configured.', 503, 'provider_not_configured');
    }
    let response: Response;
    try {
      response = await fetch(current.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + current.apiKey,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-Reasoning-Effort': 'medium',
          'X-Show-Reasoning': 'false',
        },
        body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
        signal: input.signal ? AbortSignal.any([AbortSignal.timeout(90_000), input.signal]) : AbortSignal.timeout(90_000),
      });
    } catch (error) {
      console.error('GPTOSS_CHAT_CONNECTION_ERROR', JSON.stringify({ model: input.model, error: error instanceof Error ? error.message : 'unknown_error' }));
      throw new ProviderAdapterError('Could not contact the GPT-OSS proxy.', 502, 'provider_unreachable');
    }
    if (!response.ok || !response.body) {
      console.error('GPTOSS_CHAT_REJECTED', JSON.stringify({ model: input.model, status: response.status }));
      throw new ProviderAdapterError('GPT-OSS proxy rejected the chat request.', response.status >= 400 && response.status < 500 ? response.status : 502, 'provider_request_rejected');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const consumeEvent = (eventText: string): string | null => {
      const dataLine = eventText.split(/\\r?\\n/).find((line) => line.startsWith('data:'));
      if (!dataLine) return null;
      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') return null;
      let event: any;
      try { event = JSON.parse(data); } catch { return null; }
      if (event.error) throw new ProviderAdapterError('GPT-OSS stream returned an error.', 502, 'provider_stream_error');
      const content = event.choices?.[0]?.delta?.content;
      return typeof content === 'string' && content ? content : null;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\\r?\\n\\r?\\n/);
        buffer = events.pop() || '';
        for (const eventText of events) {
          const content = consumeEvent(eventText);
          if (content) yield { content };
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const content = consumeEvent(buffer);
        if (content) yield { content };
      }
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      throw new ProviderAdapterError('GPT-OSS response stream was interrupted.', 502, 'provider_stream_interrupted');
    } finally {
      reader.releaseLock();
    }
  },
};
