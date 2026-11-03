import type {
  ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus,
  ModelDescriptor, CapabilityFlags,
} from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type CloudflareModelRecord = {
  name?: string;
  id?: string;
  model?: string;
  description?: string;
  task?: { name?: string } | string;
  properties?: { context_window?: number; max_input_tokens?: number };
};

const modelTasks = new Map<string,string>();
const CHAT_CAPABILITIES: CapabilityFlags = {
  text: true,
  streaming: true,
  vision: false,
  imageGen: false,
  imageEdit: false,
  ocr: false,
  tts: false,
  stt: false,
  tools: false,
  jsonMode: false,
};

function credentials() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim(),
  };
}

export const cloudflareWorkersAi: ChatProviderAdapter = {
  id: 'cloudflare-workers-ai',
  key: 'cloudflare-workers-ai',
  displayName: 'Cloudflare Workers AI',

  async validateConfig(): Promise<ConfigStatus> {
    const { accountId, apiToken } = credentials();
    return accountId && apiToken
      ? { valid: true }
      : { valid: false, message: 'Cloudflare AI credentials are not configured on the server.' };
  },

  capabilities(modelId: string): CapabilityFlags {
    const task = (modelTasks.get(modelId) || '').toLowerCase();
    const text = /text generation|text-generation|chat|completion/i.test(task);
    return {
      text, streaming:text,
      vision:/image to text|image-to-text|image classification|object detection|visual question/i.test(task),
      imageGen:/text to image|text-to-image|image generation/i.test(task),
      imageEdit:/image-to-image|image editing/i.test(task),
      ocr:/optical character|ocr/i.test(task),
      tts:/text to speech|text-to-speech/i.test(task),
      stt:/speech to text|speech-to-text|automatic speech recognition|asr/i.test(task),
      tools:false,jsonMode:false,
    };
  },

  async listModels(): Promise<ModelDescriptor[]> {
    const { accountId, apiToken } = credentials();
    if (!accountId || !apiToken) {
      throw new ProviderAdapterError('AI provider credentials are not configured on the server.', 503, 'provider_not_configured');
    }
    try {
      const all: CloudflareModelRecord[] = [];
      let page = 1;
      while (page <= 100) {
        const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`);
        url.searchParams.set('page',String(page));
        url.searchParams.set('per_page','100');
        url.searchParams.set('include_deprecated','true');
        const response = await fetch(url,{
          headers:{Authorization:`Bearer ${apiToken}`,Accept:'application/json'},
          signal:AbortSignal.timeout(15000),
        });
        const payload=await response.json() as {success?:boolean;result?:CloudflareModelRecord[]};
        if(!response.ok||payload.success!==true||!Array.isArray(payload.result)){
          console.error('AI_MODEL_CATALOG_FAILED',JSON.stringify({provider:this.id,status:response.status}));
          throw new ProviderAdapterError('The AI provider could not verify its model catalog.',502,'model_catalog_failed');
        }
        all.push(...payload.result);
        if(payload.result.length<100)break;
        page++;
      }
      if(page>100)throw new ProviderAdapterError('Cloudflare model catalog exceeded the pagination safety limit.',502,'model_catalog_too_large');
      const seen=new Set<string>();
      return all.map((item)=>{
        const id=item.name||item.id||item.model||'';
        const taskName=typeof item.task==='string'?item.task:item.task?.name||'';
        return {item,id,taskName};
      }).filter(({id})=>/^@cf\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(id)&&!seen.has(id)&&Boolean(seen.add(id)))
        .map(({item,id,taskName})=>{
          modelTasks.set(id,taskName);
          return {
            id,providerId:this.id,displayName:id,
            description:item.description||('Workers AI model · '+(taskName||'Unclassified task')),
            contextWindow:item.properties?.context_window||item.properties?.max_input_tokens||0,
            capabilities:this.capabilities(id),enabled:true,verifiedAt:null,
          };
        })
        .sort((a,b)=>a.id.localeCompare(b.id));
    }catch(error){
      if(error instanceof ProviderAdapterError)throw error;
      console.error('AI_MODEL_CATALOG_ERROR',JSON.stringify({provider:this.id}));
      throw new ProviderAdapterError('Could not contact the AI provider to verify its model catalog.',502,'provider_unreachable');
    }
  },

  async healthCheck(modelId: string): Promise<HealthStatus> {
    const { accountId, apiToken } = credentials();
    const checkedAt = new Date().toISOString();
    if (!accountId || !apiToken) return { healthy:false,checkedAt,message:'Provider credentials are not configured.' };
    if (!this.capabilities(modelId).text) return { healthy:false,checkedAt,message:'This model requires a modality-specific health check.' };
    try {
      const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(modelId)}`,{
        method:'POST',headers:{Authorization:`Bearer ${apiToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({prompt:'Reply OK.',max_tokens:1}),signal:AbortSignal.timeout(15000),
      });
      if(!response.ok){
        console.warn('AI_MODEL_HEALTH_FAILED',JSON.stringify({provider:this.id,model:modelId,status:response.status}));
        return {healthy:false,checkedAt,message:'Provider not reachable.'};
      }
      const payload=await response.json() as {success?:boolean;errors?:unknown[]};
      return payload.success!==false&&(!Array.isArray(payload.errors)||payload.errors.length===0)
        ? {healthy:true,checkedAt}:{healthy:false,checkedAt,message:'Provider not reachable.'};
    }catch{return {healthy:false,checkedAt,message:'Provider not reachable.'};}
  },

  async *streamChat(input: ChatRequest): AsyncIterable<ChatChunk> {
    const { accountId, apiToken } = credentials();
    if (!accountId || !apiToken) {
      throw new ProviderAdapterError('AI provider is not configured.', 503, 'provider_not_configured');
    }

    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
          signal: input.signal ? AbortSignal.any([AbortSignal.timeout(90_000), input.signal]) : AbortSignal.timeout(90_000),
        },
      );
    } catch {
      throw new ProviderAdapterError('Could not contact the AI provider.', 502, 'provider_unreachable');
    }

    if (!response.ok) {
      console.error('AI_PROVIDER_REQUEST_FAILED', JSON.stringify({ provider: this.id, status: response.status, model: input.model }));
      throw new ProviderAdapterError(
        'The AI provider rejected the request. Check model access or try another verified model.',
        response.status >= 400 && response.status < 500 ? response.status : 502,
        'provider_request_rejected',
      );
    }
    if (!response.body) {
      throw new ProviderAdapterError('The AI provider returned an empty response stream.', 502, 'empty_provider_stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const parseEvent = (eventText: string): string | null => {
      const dataLine = eventText.split(/\r?\n/).find((line) => line.startsWith('data:'));
      if (!dataLine) return null;
      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') return null;
      let event: any;
      try { event = JSON.parse(data); } catch { return null; }
      if (event.error) throw new ProviderAdapterError('The AI provider interrupted the response.', 502, 'provider_stream_error');
      const piece =
        typeof event.response === 'string' ? event.response :
        typeof event.text === 'string' ? event.text :
        typeof event.choices?.[0]?.delta?.content === 'string' ? event.choices[0].delta.content :
        undefined;
      return typeof piece === 'string' && piece.length ? piece : null;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const eventText of events) {
          const piece = parseEvent(eventText);
          if (piece) yield { content: piece };
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const piece = parseEvent(buffer);
        if (piece) yield { content: piece };
      }
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      throw new ProviderAdapterError('The AI response stream was interrupted.', 502, 'provider_stream_interrupted');
    } finally {
      reader.releaseLock();
    }
  },
};
