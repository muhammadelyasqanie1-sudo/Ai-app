import { compatibleMedia } from './compatibleMedia.ts';
import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type OpenAIModel = {
  id?: string; name?: string; description?: string; context_length?: number; context_window?: number;
  max_output_tokens?: number; top_provider?: { max_completion_tokens?: number };
  pricing?: { prompt?: string|number; completion?: string|number };
  family_label?: string; endpoints?: string[]; input_usd_per_million?: number; output_usd_per_million?: number;
  capabilities?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
};
type OpenAIModelsPage = { data?: OpenAIModel[] | { data?: OpenAIModel[] }; has_more?: boolean; last_id?: string };
const CAPABILITIES: CapabilityFlags = {
  text: true, streaming: true, vision: false, imageGen: false, imageEdit: false, ocr: false,
  tts: false, stt: false, tools: false, jsonMode: false,
};

function config() {
  const baseUrl = (process.env.OPENAI_COMPAT_BASE_URL?.trim() || '').replace(/\/+$/, '');
  const apiKey = process.env.OPENAI_COMPAT_API_KEY?.trim() || '';
  const id = process.env.OPENAI_COMPAT_PROVIDER_ID?.trim() || 'openai-compatible';
  const displayName = process.env.OPENAI_COMPAT_DISPLAY_NAME?.trim() || 'OpenAI-compatible provider';
  return { baseUrl, catalogBaseUrl: baseUrl, apiKey, id, displayName };
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
  /** Separate model-list endpoint for gateways that serve catalog and inference on different hosts. */
  catalogBaseUrl?: string;
  catalogOnlyHealthCheck?: boolean;
  allowEmptyApiKey?: boolean;
}

export function createOpenAICompatibleAdapter(options?: OpenAICompatibleAdapterOptions): ChatProviderAdapter {
  const currentConfig = () => options ? {
    id: options.id, displayName: options.displayName,
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    catalogBaseUrl: (options.catalogBaseUrl || options.baseUrl).replace(/\/+$/, ''),
    apiKey: options.apiKey,
    allowEmptyApiKey: options.allowEmptyApiKey === true,
  } : { ...config(), allowEmptyApiKey: false };
  const initial = currentConfig();
  return {
    id: initial.id,
    key: initial.id,
    displayName: initial.displayName,

    executeMedia(request, inputs, signal) { return compatibleMedia(currentConfig(), request, inputs, signal); },

    async validateConfig(): Promise<ConfigStatus> {
      const current = currentConfig();
      if (!current.baseUrl || (!current.apiKey && !current.allowEmptyApiKey) || !validBaseUrl(current.baseUrl) ||
          !current.catalogBaseUrl || !validBaseUrl(current.catalogBaseUrl)) {
        return { valid: false, message: 'Set a valid HTTPS OPENAI_COMPAT_BASE_URL and server-side OPENAI_COMPAT_API_KEY.' };
      }
      return { valid: true };
    },

    capabilities(_modelId: string): CapabilityFlags { return { ...CAPABILITIES }; },

    async listModels(): Promise<ModelDescriptor[]> {
      const current = currentConfig();
      if (!current.baseUrl || (!current.apiKey && !current.allowEmptyApiKey) || !validBaseUrl(current.baseUrl)) {
        throw new ProviderAdapterError('OpenAI-compatible provider is not configured.', 503, 'provider_not_configured');
      }
      try {
        const all: OpenAIModel[] = [];
        let after: string | undefined;
        let pages = 0;
        while (pages++ < 50) {
          const url = new URL(current.catalogBaseUrl + '/models');
          url.searchParams.set('limit', '100');
          if (after) url.searchParams.set('after', after);
          const response = await fetch(url, {
            headers: { ...(current.apiKey ? { Authorization: 'Bearer ' + current.apiKey } : {}), Accept: 'application/json' },
            signal: AbortSignal.timeout(15_000), redirect: 'error',
          });
          if (!response.ok) {
            const errorCode = await response.clone().json().then((body: any) => {
              const value = body?.error?.code ?? body?.code ?? body?.error?.type;
              return typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : undefined;
            }).catch(() => undefined);
            console.error('AI_PROVIDER_MODEL_DISCOVERY_FAILED', JSON.stringify({
              provider: current.id, status: response.status, ...(errorCode ? { errorCode } : {}),
            }));
            throw new ProviderAdapterError('Provider model discovery failed.', response.status >= 400 && response.status < 500 ? response.status : 502, 'model_catalog_failed');
          }
          const payload = await response.json() as OpenAIModelsPage;
          const pageModels = Array.isArray(payload.data) ? payload.data : (payload.data && Array.isArray(payload.data.data) ? payload.data.data : null);
          if (!pageModels) throw new ProviderAdapterError('Provider returned an invalid model catalog.', 502, 'invalid_model_catalog');
          all.push(...pageModels);
          if (payload.has_more !== true) break;
          const next = payload.last_id || pageModels[pageModels.length - 1]?.id;
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
          const beatApiInputPrice = Number(model.input_usd_per_million);
          const beatApiOutputPrice = Number(model.output_usd_per_million);
          // Gateways expose capabilities in several shapes: OpenRouter-style
          // supported_parameters arrays, string labels, or boolean capability maps.
          // Normalize all known tool-calling signals so eligible models are not
          // incorrectly hidden from integration requests.
          const rawCapabilities = model.capabilities as unknown;
          const labels = Array.isArray(rawCapabilities)
            ? rawCapabilities.filter((value): value is string => typeof value === 'string')
            : [];
          const capabilityMap = rawCapabilities && typeof rawCapabilities === 'object' && !Array.isArray(rawCapabilities)
            ? rawCapabilities as Record<string, unknown>
            : {};
          const featureValues = (model as any).features;
          const featureLabels = Array.isArray(featureValues)
            ? featureValues.map((value: any) => typeof value === 'string' ? value : String(value?.id || value?.name || value?.key || '')).filter(Boolean)
            : [];
          const allLabels = [...labels, ...featureLabels, ...parameters];
          const hasCapability = (...names: string[]) => names.some((name) =>
            capabilityMap[name] === true || capabilityMap[name.toLowerCase()] === true ||
            allLabels.some((value) => value.toLowerCase().replace(/[\\s-]+/g, '_') === name.toLowerCase()),
          );
          const inputHasImage = inputModalities.includes('image') || hasCapability('vision', 'image', 'image_input');
          const outputHasImage = outputModalities.includes('image') || hasCapability('image_generation', 'image_gen');
          const supportsTools = hasCapability('tools', 'tool_calling', 'function_calling', 'tool_use') ||
            parameters.some((value) => /^(tools|tool_choice|function_calling)$/i.test(value));
          return {
            id: model.id as string,
            mediaEndpoints: Array.isArray(model.endpoints) ? model.endpoints.filter((v): v is string => typeof v === 'string') : [],
            providerId: current.id,
            displayName: model.name || model.family_label || model.id as string,
            description: model.description || 'Model discovered from the configured provider catalog.',
            contextWindow: Number.isFinite(model.context_window) ? Number(model.context_window) : (Number.isFinite(model.context_length) ? Number(model.context_length) : 0),
            maxOutput: Number(model.max_output_tokens || model.top_provider?.max_completion_tokens || 0) || undefined,
            pricing: {
              inputPerMillion: Number.isFinite(beatApiInputPrice) ? beatApiInputPrice : (Number.isFinite(promptPrice) ? promptPrice * 1_000_000 : null),
              outputPerMillion: Number.isFinite(beatApiOutputPrice) ? beatApiOutputPrice : (Number.isFinite(completionPrice) ? completionPrice * 1_000_000 : null),
              currency: 'USD',
            },
            capabilities: {
              text: true, streaming: true,
              vision: inputHasImage,
              imageGen: outputHasImage,
              imageEdit: hasCapability('image_edit', 'image_editing'), ocr: false, tts: outputModalities.includes('audio'),
              stt: inputModalities.includes('audio'), tools: supportsTools,
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
      if (!current.baseUrl || (!current.apiKey && !current.allowEmptyApiKey) || !validBaseUrl(current.baseUrl)) {
        return { healthy: false, checkedAt, message: 'Provider not reachable.' };
      }
      try {
        // Some gateways charge for even a one-token generation. For those providers,
        // verify only authenticated catalog access and model visibility.
        if (options?.catalogOnlyHealthCheck) {
          const response = await fetch(current.catalogBaseUrl + '/models', {
            headers: { ...(current.apiKey ? { Authorization: 'Bearer ' + current.apiKey } : {}), Accept: 'application/json' },
            signal: AbortSignal.timeout(15_000), redirect: 'error',
          });
          if (!response.ok) {
            const errorCode = await response.clone().json().then((body: any) => {
              const value = body?.error?.code ?? body?.code ?? body?.error?.type;
              return typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : undefined;
            }).catch(() => undefined);
            console.warn('AI_PROVIDER_HEALTH_CHECK_FAILED', JSON.stringify({
              provider: current.id, model: modelId, status: response.status,
              ...(errorCode ? { errorCode } : {}),
            }));
            return { healthy: false, checkedAt, message: 'Provider catalog check failed.' };
          }
          const payload = await response.json() as OpenAIModelsPage;
          const rows = Array.isArray(payload.data) ? payload.data : (payload.data && Array.isArray(payload.data.data) ? payload.data.data : []);
          return rows.some((model) => model.id === modelId)
            ? { healthy: true, checkedAt }
            : { healthy: false, checkedAt, message: 'Model is not present in the provider catalog.' };
        }
        // Prove actual inference access with a one-token probe for ordinary providers.
        const probePayload = { model: modelId, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 1, stream: false };
        const response = await fetch(current.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { ...(current.apiKey ? { Authorization: 'Bearer ' + current.apiKey } : {}), 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(probePayload),
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
      if (!current.baseUrl || (!current.apiKey && !current.allowEmptyApiKey) || !validBaseUrl(current.baseUrl)) {
        throw new ProviderAdapterError('OpenAI-compatible provider is not configured.', 503, 'provider_not_configured');
      }
      let response: Response;
      try {
        response = await fetch(current.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { ...(current.apiKey ? { Authorization: 'Bearer ' + current.apiKey } : {}), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ model: input.model, messages: input.messages, stream: true, ...(Number.isInteger(input.maxOutputTokens) && Number(input.maxOutputTokens) > 0 ? { max_tokens: input.maxOutputTokens } : {}), ...(input.tools?.length ? { tools: input.tools, tool_choice: 'auto' } : {}) }),
          signal: input.signal ? AbortSignal.any([AbortSignal.timeout(90_000), input.signal]) : AbortSignal.timeout(90_000), redirect: 'error',
        });
      } catch (error) {
        console.error('AI_PROVIDER_CHAT_CONNECTION_ERROR', JSON.stringify({ provider: current.id, model: input.model, error: error instanceof Error ? error.message : 'unknown_error' }));
        throw new ProviderAdapterError('Could not contact the OpenAI-compatible provider.', 502, 'provider_unreachable');
      }
      if (!response.ok || !response.body) {
        const upstreamError: { code?: string; type?: string } = await response.clone().json().then((body: any): { code?: string; type?: string } => ({
          code: typeof body?.error?.code === 'string' ? body.error.code : undefined,
          type: typeof body?.error?.type === 'string' ? body.error.type : undefined,
        })).catch((): { code?: string; type?: string } => ({}));
        const errorCode = response.status === 402 ? 'insufficient_funds'
          : response.status === 429 ? 'rate_limit_exceeded'
          : upstreamError.code || 'provider_request_rejected';
        console.error('AI_PROVIDER_CHAT_REJECTED', JSON.stringify({
          provider: current.id, model: input.model, status: response.status,
          ...(upstreamError.code ? { upstreamCode: upstreamError.code } : {}),
          ...(upstreamError.type ? { upstreamType: upstreamError.type } : {}),
        }));
        const message = response.status === 402
          ? 'The provider monthly token allowance and account balance are exhausted.'
          : 'The OpenAI-compatible provider rejected the chat request.';
        throw new ProviderAdapterError(message, response.status >= 400 && response.status < 500 ? response.status : 502, errorCode);
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
            const delta=event.choices?.[0]?.delta;
            const content=delta?.content;
            const toolCalls=Array.isArray(delta?.tool_calls)?delta.tool_calls.map((call:any)=>({
              index:Number.isInteger(call.index)?call.index:0,
              ...(typeof call.id==='string'?{id:call.id}:{}),
              ...(call.type==='function'?{type:'function' as const}:{}),
              ...(call.function&&typeof call.function==='object'?{function:{
                ...(typeof call.function.name==='string'?{name:call.function.name}:{}),
                ...(typeof call.function.arguments==='string'?{arguments:call.function.arguments}:{}),
              }}:{}),
            })):[];
            if(typeof content==='string'&&content)yield {content};
            if(toolCalls.length)yield {content:'',toolCalls};
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
            const delta=event?.choices?.[0]?.delta;
            const content=delta?.content;
            const toolCalls=Array.isArray(delta?.tool_calls)?delta.tool_calls.map((call:any)=>({
              index:Number.isInteger(call.index)?call.index:0,
              ...(typeof call.id==='string'?{id:call.id}:{}),
              ...(call.type==='function'?{type:'function' as const}:{}),
              ...(call.function&&typeof call.function==='object'?{function:{
                ...(typeof call.function.name==='string'?{name:call.function.name}:{}),
                ...(typeof call.function.arguments==='string'?{arguments:call.function.arguments}:{}),
              }}:{}),
            })):[];
            if(typeof content==='string'&&content)yield {content};
            if(toolCalls.length)yield {content:'',toolCalls};
          }
        }
      } catch (error) {
        if (error instanceof ProviderAdapterError) throw error;
        throw new ProviderAdapterError('The provider response stream was interrupted.', 502, 'provider_stream_interrupted');
      } finally { reader.releaseLock(); }
    },
  };
}
