import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

export interface AnthropicAdapterOptions { id: string; displayName: string; baseUrl: string; apiKey: string; }
type AnthropicModel = { id?: string; display_name?: string; displayName?: string; created_at?: string };
const ANTHROPIC_VERSION = '2023-06-01';
const CAPABILITIES: CapabilityFlags = {
  text:true,streaming:true,vision:false,imageGen:false,imageEdit:false,ocr:false,
  tts:false,stt:false,tools:false,jsonMode:false,
};
function safeBaseUrl(value:string): boolean {
  try { const u=new URL(value); return u.protocol==='https:' || (process.env.NODE_ENV!=='production' && u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)); }
  catch { return false; }
}
export function createAnthropicAdapter(options:AnthropicAdapterOptions):ChatProviderAdapter {
  const baseUrl=options.baseUrl.replace(/\/+$/,'');
  const headers={'x-api-key':options.apiKey,'anthropic-version':ANTHROPIC_VERSION,'content-type':'application/json'};
  const toMessages=(messages:ChatRequest['messages'])=>({
    system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n') || undefined,
    messages:messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:m.content})),
  });
  return {
    id:options.id,key:options.id,displayName:options.displayName,
    async validateConfig():Promise<ConfigStatus>{
      return options.apiKey && safeBaseUrl(baseUrl) ? {valid:true} : {valid:false,message:'Anthropic API key or HTTPS base URL is not configured.'};
    },
    capabilities():CapabilityFlags{return {...CAPABILITIES};},
    async listModels():Promise<ModelDescriptor[]>{
      if(!options.apiKey||!safeBaseUrl(baseUrl))throw new ProviderAdapterError('Anthropic is not configured.',503,'provider_not_configured');
      const all:AnthropicModel[]=[];let afterId:string|undefined;let pages=0;
      try{
        while(pages++<100){
          const url=new URL(baseUrl+'/v1/models');
          url.searchParams.set('limit','100');
          if(afterId)url.searchParams.set('after_id',afterId);
          const response=await fetch(url,{headers:{'x-api-key':options.apiKey,'anthropic-version':ANTHROPIC_VERSION,accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});
          if(!response.ok)throw new ProviderAdapterError('Anthropic model discovery failed.',response.status>=500?502:response.status,'model_catalog_failed');
          const payload=await response.json() as {data?:AnthropicModel[];has_more?:boolean;last_id?:string};
          if(!Array.isArray(payload.data))throw new ProviderAdapterError('Anthropic returned an invalid model catalog.',502,'invalid_model_catalog');
          all.push(...payload.data);
          if(!payload.has_more)break;
          const next=payload.last_id||payload.data[payload.data.length-1]?.id;
          if(!next||next===afterId)throw new ProviderAdapterError('Anthropic model pagination did not advance.',502,'model_pagination_invalid');
          afterId=next;
        }
        if(pages>100)throw new ProviderAdapterError('Anthropic model catalog exceeded the pagination safety limit.',502,'model_catalog_too_large');
        return all.filter(m=>typeof m.id==='string'&&m.id.length>0).map(m=>({
          id:m.id!,providerId:options.id,displayName:m.display_name||m.displayName||m.id!,
          description:'Model discovered from the Anthropic Models API.',contextWindow:0,capabilities:{...CAPABILITIES},enabled:true,verifiedAt:null,
        }));
      }catch(error){if(error instanceof ProviderAdapterError)throw error;throw new ProviderAdapterError('Could not reach Anthropic model discovery.',502,'provider_unreachable');}
    },
    async healthCheck(modelId:string):Promise<HealthStatus>{
      const checkedAt=new Date().toISOString();
      try{
        const response=await fetch(baseUrl+'/v1/messages',{method:'POST',headers,body:JSON.stringify({
          model:modelId,max_tokens:1,messages:[{role:'user',content:'Reply OK.'}],
        }),signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!response.ok)return {healthy:false,checkedAt,message:'Anthropic inference probe failed.'};
        const payload=await response.json() as {content?:unknown[];error?:unknown};
        return {healthy:Array.isArray(payload.content)&&!payload.error,checkedAt};
      }catch{return {healthy:false,checkedAt,message:'Anthropic inference probe failed.'};}
    },
    async *streamChat(input:ChatRequest):AsyncIterable<ChatChunk>{
      const mapped=toMessages(input.messages);
      let response:Response;
      try{
        response=await fetch(baseUrl+'/v1/messages',{method:'POST',headers:{...headers,accept:'text/event-stream'},
          body:JSON.stringify({model:input.model,...mapped,max_tokens:4096,stream:true}),
          signal:input.signal?AbortSignal.any([AbortSignal.timeout(90000),input.signal]):AbortSignal.timeout(90000),redirect:'error'});
      }catch{throw new ProviderAdapterError('Could not contact Anthropic.',502,'provider_unreachable');}
      if(!response.ok||!response.body)throw new ProviderAdapterError('Anthropic rejected the request.',response.status>=400&&response.status<500?response.status:502,'provider_request_rejected');
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
      try{
        while(true){
          const {done,value}=await reader.read();if(done)break;
          buffer+=decoder.decode(value,{stream:true});
          const events=buffer.split(/\r?\n\r?\n/);buffer=events.pop()||'';
          for(const eventText of events){
            const dataLine=eventText.split(/\r?\n/).find(line=>line.startsWith('data:'));
            if(!dataLine)continue;
            let payload:any;try{payload=JSON.parse(dataLine.slice(5).trim());}catch{continue;}
            if(payload.type==='error')throw new ProviderAdapterError('Anthropic interrupted the response.',502,'provider_stream_error');
            const text=payload.type==='content_block_delta'&&payload.delta?.type==='text_delta'?payload.delta.text:null;
            if(typeof text==='string'&&text)yield {content:text};
          }
        }
      }catch(error){if(error instanceof ProviderAdapterError)throw error;throw new ProviderAdapterError('Anthropic response stream was interrupted.',502,'provider_stream_interrupted');}
      finally{reader.releaseLock();}
    },
  };
}
