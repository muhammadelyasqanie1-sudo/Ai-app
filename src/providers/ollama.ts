import type { ChatChunk, ChatRequest, ChatProviderAdapter, ConfigStatus, HealthStatus, ModelDescriptor, CapabilityFlags } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type OllamaTag = { name?:string; model?:string; details?:{family?:string;parameter_size?:string;quantization_level?:string}; size?:number; modified_at?:string };
const CAPABILITIES:CapabilityFlags={text:true,streaming:true,vision:false,imageGen:false,imageEdit:false,ocr:false,tts:false,stt:false,tools:false,jsonMode:false};

function localUrl(value:string):boolean{
  try{
    const url=new URL(value);
    return url.protocol==='http:'&&['localhost','127.0.0.1','::1'].includes(url.hostname);
  }catch{return false;}
}

export function createOllamaAdapter(id='ollama',displayName='Ollama (Local)',configuredBaseUrl?:string):ChatProviderAdapter{
  const base=()=>((configuredBaseUrl||process.env.OLLAMA_BASE_URL||'http://127.0.0.1:11434').trim().replace(/\/+$/,''));
  return{
    id,key:id,displayName,
    async validateConfig():Promise<ConfigStatus>{
      return localUrl(base())?{valid:true}:{valid:false,message:'Ollama must be a loopback HTTP endpoint on the same machine as the AFG AI server.'};
    },
    capabilities():CapabilityFlags{return {...CAPABILITIES};},
    async listModels():Promise<ModelDescriptor[]>{
      if(!localUrl(base()))throw new ProviderAdapterError('Ollama endpoint must be local to the AFG AI server.',503,'provider_not_configured');
      try{
        const response=await fetch(base()+'/api/tags',{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new ProviderAdapterError('Ollama model discovery failed.',502,'model_catalog_failed');
        const payload=await response.json() as {models?:OllamaTag[]};
        if(!Array.isArray(payload.models))throw new ProviderAdapterError('Ollama returned an invalid model catalog.',502,'invalid_model_catalog');
        return payload.models.filter(m=>typeof(m.name||m.model)==='string').map(m=>{
          const modelId=(m.name||m.model)!;
          return{id:modelId,providerId:id,displayName:modelId,description:'Locally installed Ollama model · '+(m.details?.family||'unknown family'),
            contextWindow:0,capabilities:{...CAPABILITIES},enabled:false,verifiedAt:null};
        });
      }catch(error){if(error instanceof ProviderAdapterError)throw error;throw new ProviderAdapterError('Could not contact the local Ollama service.',502,'provider_unreachable');}
    },
    async healthCheck(modelId:string):Promise<HealthStatus>{
      const checkedAt=new Date().toISOString();
      if(!localUrl(base()))return{healthy:false,checkedAt,message:'Ollama is not running on the AFG AI server.'};
      try{
        const response=await fetch(base()+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({model:modelId,messages:[{role:'user',content:'Reply OK.'}],stream:false,options:{num_predict:1}}),
          signal:AbortSignal.timeout(20000)});
        if(!response.ok)return{healthy:false,checkedAt,message:'Ollama inference probe failed.'};
        const payload=await response.json() as {message?:{content?:string};error?:string};
        return typeof payload.message?.content==='string'&&!payload.error
          ?{healthy:true,checkedAt}:{healthy:false,checkedAt,message:'Ollama inference probe returned no completion.'};
      }catch{return{healthy:false,checkedAt,message:'Ollama inference probe failed.'};}
    },
    async *streamChat(input:ChatRequest):AsyncIterable<ChatChunk>{
      if(!localUrl(base()))throw new ProviderAdapterError('Ollama is not configured locally.',503,'provider_not_configured');
      let response:Response;
      try{
        response=await fetch(base()+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({model:input.model,messages:input.messages,stream:true}),
          signal:input.signal?AbortSignal.any([AbortSignal.timeout(90000),input.signal]):AbortSignal.timeout(90000)});
      }catch{throw new ProviderAdapterError('Could not contact local Ollama.',502,'provider_unreachable');}
      if(!response.ok||!response.body)throw new ProviderAdapterError('Ollama rejected the request.',response.status>=400&&response.status<500?response.status:502,'provider_request_rejected');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      try{
        while(true){
          const {done,value}=await reader.read();if(done)break;
          buffer+=decoder.decode(value,{stream:true});
          const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
          for(const line of lines){if(!line.trim())continue;let row:any;try{row=JSON.parse(line);}catch{continue;}
            if(row.error)throw new ProviderAdapterError('Ollama stream returned an error.',502,'provider_stream_error');
            if(typeof row.message?.content==='string'&&row.message.content)yield{content:row.message.content};
          }
        }
        if(buffer.trim()){const row=JSON.parse(buffer);if(typeof row.message?.content==='string'&&row.message.content)yield{content:row.message.content};}
      }catch(error){if(error instanceof ProviderAdapterError)throw error;throw new ProviderAdapterError('Ollama response stream was interrupted.',502,'provider_stream_interrupted');}
      finally{reader.releaseLock();}
    }
  };
}
