import type {IncomingMessage,ServerResponse} from 'http';
import {randomUUID} from 'node:crypto';
import {pool} from './database.ts';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {authenticateRequest,sendAuthJson,verifyCsrf} from './auth.ts';

const blocked=new BlockList();
for(const [address,prefix] of [
 ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
 ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],
 ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
] as const)blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [
 ['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],
 ['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]
] as const)blocked.addSubnet(address,prefix,'ipv6');
const blockedIpv4Ranges:readonly [string,number][]=[
 ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
 ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],
 ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
];
function ipv4Number(address:string):number|null{
 const parts=address.split('.');
 if(parts.length!==4)return null;
 let value=0;
 for(const part of parts){
  if(!/^\d{1,3}$/.test(part))return null;
  const octet=Number(part);if(octet>255)return null;
  value=(value*256)+octet;
 }
 return value>>>0;
}
function isBlockedIpv4(address:string):boolean{
 const value=ipv4Number(address);if(value===null)return true;
 return blockedIpv4Ranges.some(([network,prefix])=>{
  const base=ipv4Number(network);if(base===null)return true;
  const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;
  return (value&mask)===(base&mask);
 });
}
function isPublicAddress(address:string):boolean{
 const family=isIP(address);if(!family)return false;
 if(family===4)return !isBlockedIpv4(address);
 const lower=address.toLowerCase();
 if(lower.startsWith('::ffff:')){const mapped=lower.slice(7);if(isIP(mapped)===4)return !isBlockedIpv4(mapped);}
 return !blocked.check(address,'ipv6');
}
async function routerBase():Promise<URL>{
 const configured=(process.env.NINEROUTER_BASE_URL||'').trim().replace(/\/+$/,'');
 if(!configured)throw new Error('9Router is not configured. Set NINEROUTER_BASE_URL.');
 let url:URL;try{url=new URL(configured);}catch{throw new Error('9Router base URL is invalid.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('9Router must use a public HTTPS base URL.');
 if(!url.pathname.endsWith('/v1'))url.pathname=url.pathname.replace(/\/+$/,'')+'/v1';
 if(isIP(url.hostname)){if(!isPublicAddress(url.hostname))throw new Error('9Router resolves to a blocked network address.');}
 else{
  const records=await lookup(url.hostname,{all:true,verbatim:true});
  const validation=records.map(record=>({address:record.address,family:record.family,public:isPublicAddress(record.address)}));
   if(!records.length||validation.some(record=>!record.public)){console.error('NINEROUTER_DNS_VALIDATION',JSON.stringify({hostname:url.hostname,records:validation}));throw new Error('9Router host resolves to a private or reserved network address.');}
 }
 return url;
}
function reply(res:ServerResponse,status:number,payload:unknown,requestId:string){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Request-Id':requestId});
 res.end(JSON.stringify({...payload as object,requestId}));
}
async function readRequestBody(req:IncomingMessage,maxBytes:number):Promise<Buffer>{
 const chunks:Buffer[]=[];let size=0;
 for await(const part of req){
  const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);size+=chunk.length;
  if(size>maxBytes)throw new Error('request_too_large');
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
const MODEL_KINDS=new Set(['llm','image','tts','embedding','web','stt','image-to-text']);
const POST_ENDPOINTS=new Map<string,string>([
 ['/api/9router/chat/completions','/chat/completions'],
 ['/api/9router/messages','/messages'],
 ['/api/9router/responses','/responses'],
 ['/api/9router/responses/compact','/responses/compact'],
 ['/api/9router/messages/count_tokens','/messages/count_tokens'],
 ['/api/9router/systemone','/systemone'],
 ['/api/9router/images/generations','/images/generations'],
 ['/api/9router/audio/speech','/audio/speech'],
 ['/api/9router/audio/transcriptions','/audio/transcriptions'],
 ['/api/9router/embeddings','/embeddings'],
 ['/api/9router/search','/search'],
 ['/api/9router/web/fetch','/web/fetch'],
 ['/api/9router/videos/generations','/videos/generations'],
 ['/api/9router/videos/edits','/videos/edits'],
 ['/api/9router/videos/extensions','/videos/extensions'],
]);
const MAX_BODY_BYTES=22*1024*1024;
const MAX_RESPONSE_BYTES=30*1024*1024;
const active=new Map<string,{count:number;started:number}>();
function rateLimit(userId:string):boolean{
 const now=Date.now(),row=active.get(userId);
 if(!row||now-row.started>=60_000){active.set(userId,{count:1,started:now});return true;}
 if(row.count>=20)return false;
 row.count++;return true;
}
function cleanContentType(value:string|null):string{
 if(!value)return 'application/octet-stream';
 return value.slice(0,150).replace(/[\r\n]/g,'');
}
async function proxy(req:IncomingMessage,res:ServerResponse,target:URL,key:string,requestId:string){
 const headers=new Headers();
 const contentType=typeof req.headers['content-type']==='string'?req.headers['content-type']:'';
 if(contentType)headers.set('Content-Type',contentType);
 headers.set('Accept',typeof req.headers.accept==='string'?req.headers.accept:'application/json');
 if(key)headers.set('Authorization','Bearer '+key);
 headers.set('X-Request-Id',requestId);
 const tokenSaverOverride=req.headers['x-9router-token-saver'];
 if(typeof tokenSaverOverride==='string'&&/^(on|off)$/i.test(tokenSaverOverride)){
  headers.set('X-9Router-Token-Saver',tokenSaverOverride.toLowerCase());
 }
 const method=(req.method||'GET').toUpperCase();
 let body:Buffer|undefined;
 if(method==='POST'){
  body=await readRequestBody(req,MAX_BODY_BYTES);
  if(!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 }
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(new Error('9Router request timed out.')),180_000);
 const abortClient=()=>controller.abort(new Error('Client disconnected.'));
 req.once('aborted',abortClient);
 res.once('close',()=>{if(!res.writableEnded)controller.abort(new Error('Client disconnected.'));});
 let response!:Response;
 try{
  const maxAttempts=method==='GET'?3:1;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   response=await fetch(target.toString(),{method,headers,body:body?new Blob([Uint8Array.from(body)]):undefined,redirect:'error',signal:controller.signal});
   const retryable=[408,425,429,500,502,503,504].includes(response.status);
   if(!retryable||attempt===maxAttempts)break;
   const retryAfter=response.headers.get('retry-after')||'';
   await response.body?.cancel().catch(()=>{});
   const seconds=Number(retryAfter);
   const delay=Number.isFinite(seconds)&&seconds>=0?Math.min(5000,seconds*1000):Math.min(250*attempt,1000);
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }finally{clearTimeout(timeout);}
 const type=cleanContentType(response.headers.get('content-type'));
 const length=response.headers.get('content-length');
 if(length&&Number(length)>MAX_RESPONSE_BYTES)throw new Error('9Router response exceeded the 30 MB size limit.');
 if(response.ok&&type.toLowerCase().includes('text/event-stream')&&response.body){
  const allowedHeaders=['content-type','cache-control','retry-after','x-request-id'];
  const out:Record<string,string>={'Cache-Control':'no-store','X-Request-Id':requestId};
  for(const name of allowedHeaders){const value=response.headers.get(name);if(value)out[name]=value.slice(0,500);}
  res.writeHead(response.status,out);
  const reader=response.body.getReader();let total=0;
  try{
   while(true){
    const chunk=await reader.read();if(chunk.done)break;
    total+=chunk.value.byteLength;
    if(total>MAX_RESPONSE_BYTES){await reader.cancel();res.destroy(new Error('9Router stream exceeded the 30 MB size limit.'));return;}
    if(res.destroyed){await reader.cancel();return;}
    if(!res.write(Buffer.from(chunk.value)))await new Promise<void>((resolve,reject)=>{
      const done=()=>{res.off('error',failed);resolve();};
      const failed=(error:Error)=>{res.off('drain',done);reject(error);};
      res.once('drain',done);res.once('error',failed);
    });
   }
   res.end();
  }catch(error){await reader.cancel().catch(()=>{});if(!res.destroyed)res.destroy(error instanceof Error?error:undefined);}
  return;
 }
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>MAX_RESPONSE_BYTES)throw new Error('9Router response exceeded the 30 MB size limit.');
 if(!response.ok){
  let code='upstream_rejected';
  if(type.includes('json')){try{const parsed=JSON.parse(bytes.toString('utf8'));const candidate=parsed?.error?.code||parsed?.error?.type;if(typeof candidate==='string'&&/^[a-z0-9_.-]{1,80}$/i.test(candidate))code=candidate;}catch{}}
  reply(res,response.status>=400&&response.status<500?response.status:502,{error:'9Router could not complete this request.',code},requestId);return;
 }
 const allowedHeaders=['content-type','content-disposition','cache-control','retry-after','x-9router-connection-id','x-request-id'];
 const out:Record<string,string>={'Cache-Control':'no-store','X-Request-Id':requestId};
 for(const name of allowedHeaders){const value=response.headers.get(name);if(value)out[name]=value.slice(0,500);}
 res.writeHead(response.status,out);
 res.end(bytes);
}
export async function handleNineRouterApi(req:IncomingMessage,res:ServerResponse,pathname:string):Promise<boolean>{
 if(!pathname.startsWith('/api/9router/'))return false;
 const requestId=randomUUID();
 const startedAt=Date.now();
 const user=await authenticateRequest(req).catch(()=>null);
 if(!user){reply(res,401,{available:false,error:'Sign in is required.'},requestId);return true;}
 if(user.role!=='admin'&&user.role!=='superadmin'){reply(res,403,{available:false,error:'The shared 9Router gateway is currently restricted to administrators until provider accounts are isolated per user.'},requestId);return true;}
 if(req.method!=='GET'&&!verifyCsrf(req)){reply(res,403,{error:'CSRF validation failed.'},requestId);return true;}
 if(pool){const setting=await pool.query("SELECT value_json FROM system_config WHERE key='ninerouter_gateway_enabled' LIMIT 1").catch(()=>({rows:[]}));if(setting.rows[0]?.value_json===false){reply(res,503,{available:false,error:'9Router gateway is paused by the administrator.'},requestId);return true;}}
 if(!rateLimit(user.id)){reply(res,429,{error:'9Router proxy limit is 20 requests per minute per user.'},requestId);return true;}
 const key=(process.env.NINEROUTER_API_KEY||'').trim().replace(/^Bearer\s+/i,'').trim();
 if(!process.env.NINEROUTER_BASE_URL?.trim()){
  reply(res,503,{available:false,error:'9Router is not configured on the server. Set NINEROUTER_BASE_URL; set NINEROUTER_API_KEY only when 9Router API authentication is enabled.'},requestId);return true;
 }
 try{
  if(req.method==='GET'&&pathname==='/api/9router/status'){
   const base=await routerBase();
   const healthUrl=new URL('/api/health',base.origin);
   try{
    const healthHeaders=new Headers({Accept:'application/json'});if(key)healthHeaders.set('Authorization','Bearer '+key);
    const response=await fetch(healthUrl.toString(),{headers:healthHeaders,redirect:'error',signal:AbortSignal.timeout(8000)});
    const health=await response.json().catch(()=>null);
    reply(res,response.ok?200:503,{configured:true,reachable:response.ok,health,dashboardUrl:new URL('/dashboard',base.origin).toString()},requestId);
   }catch{
    reply(res,503,{configured:true,reachable:false,error:'The 9Router health endpoint could not be reached.'},requestId);
   }
   return true;
  }
  const base=await routerBase();
  if(req.method==='GET'&&(pathname==='/api/9router/models'||pathname==='/api/9router/models/info')){
   const incoming=new URL(req.url||'/', 'http://localhost');
   const suffix=pathname.endsWith('/info')?'/models/info':'/models';
   if(suffix==='/models/info'){
    const id=incoming.searchParams.get('id')||'';
    if(!id||id.length>400||/[\r\n]/.test(id)){reply(res,400,{error:'A valid model id is required.'},requestId);return true;}
    const url=new URL(base.toString());url.pathname=base.pathname+suffix;url.searchParams.set('id',id);
    const kind=incoming.searchParams.get('kind');if(kind)url.searchParams.set('kind',kind.slice(0,40));
    await proxy(req,res,url,key,requestId);return true;
   }
   const kind=incoming.searchParams.get('kind')||'llm';
   if(!MODEL_KINDS.has(kind)){reply(res,400,{error:'Unsupported 9Router model kind.'},requestId);return true;}
   const segments=kind==='llm'?[]:[kind];
   const url=new URL(base.toString());url.pathname=base.pathname+'/models'+(segments.length?'/'+segments[0]:'');
   await proxy(req,res,url,key,requestId);return true;
  }
  const modelKindPath=pathname.match(/^\/api\/9router\/models\/(llm|image|tts|embedding|web|stt|image-to-text)$/);
  if(req.method==='GET'&&modelKindPath){
   const url=new URL(base.toString());url.pathname=base.pathname+'/models/'+modelKindPath[1];
   await proxy(req,res,url,key,requestId);return true;
  }
  if(req.method==='GET'&&pathname==='/api/9router/audio/voices'){
   const incoming=new URL(req.url||'/', 'http://localhost');
   const url=new URL(base.toString());url.pathname=base.pathname+'/audio/voices';
   const provider=incoming.searchParams.get('provider'),language=incoming.searchParams.get('lang');
   if(provider)url.searchParams.set('provider',provider.slice(0,80));
   if(language)url.searchParams.set('lang',language.slice(0,20));
   await proxy(req,res,url,key,requestId);return true;
  }
  if(req.method==='POST'&&POST_ENDPOINTS.has(pathname)){
   if(pathname.startsWith('/api/9router/videos/')){
    const requestBytes=await readRequestBody(req,MAX_BODY_BYTES);
    let body:Json;
    try{body=JSON.parse(requestBytes.toString('utf8')) as Json;}catch{reply(res,400,{error:'Video generation requires a JSON body.'},requestId);return true;}
    if(!body||typeof body!=='object'||Array.isArray(body)){
     reply(res,400,{error:'Provide a valid video request body.'},requestId);return true;
    }
    if(pathname==='/api/9router/videos/generations'){
     const hasPrompt=typeof body.prompt==='string'&&body.prompt.trim().length>0;
     const hasImage=body.image&&typeof body.image==='object'&&typeof body.image.url==='string'&&
       (/^https:\/\//i.test(body.image.url)||/^data:image\/(png|jpeg|webp);base64,/i.test(body.image.url));
     if(!hasPrompt&&!hasImage){reply(res,400,{error:'Text-to-video requires a prompt; image-to-video requires a valid HTTPS or image data URL.'},requestId);return true;}
    }else{
     const source=body.video;
     if(!source||typeof source!=='object'||(!/^https:\/\//i.test(String(source.url||''))&&!/^[A-Za-z0-9_-]{1,180}$/.test(String(source.file_id||'')))){
      reply(res,400,{error:'Video edits and extensions require an HTTPS video URL or a valid video file_id.'},requestId);return true;
     }
    }
    const headers=new Headers({'Content-Type':'application/json','Accept':'application/json','X-Request-Id':requestId});if(key)headers.set('Authorization','Bearer '+key);
    const target=new URL(base.toString());target.pathname=base.pathname+POST_ENDPOINTS.get(pathname)!;
    const response=await fetch(target.toString(),{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(180_000)});
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>2_000_000)throw new Error('9Router video job response exceeded the safety limit.');
    if(!response.ok){reply(res,response.status>=400&&response.status<500?response.status:502,{error:'9Router video generation could not be started.'},requestId);return true;}
    const data=JSON.parse(bytes.toString('utf8'));
    const connectionId=response.headers.get('x-9router-connection-id');
    const responseHeaders:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Request-Id':requestId};
    if(connectionId)responseHeaders['X-9Router-Connection-Id']=connectionId.slice(0,200);
    res.writeHead(response.status,responseHeaders);
    res.end(JSON.stringify({...data,requestId}));return true;
   }
   const suffix=POST_ENDPOINTS.get(pathname)!;
   const target=new URL(base.toString());target.pathname=base.pathname+suffix;
   if(pathname==='/api/9router/images/generations'||pathname==='/api/9router/audio/speech'){
    const incoming=new URL(req.url||'/', 'http://localhost');
    if(incoming.searchParams.get('response_format')==='binary')target.searchParams.set('response_format','binary');
    else if(incoming.searchParams.get('response_format')==='json')target.searchParams.set('response_format','json');
   }
   await proxy(req,res,target,key,requestId);return true;
  }
  const video=pathname.match(/^\/api\/9router\/videos\/([A-Za-z0-9_-]{1,180})$/);
  if(req.method==='GET'&&video){
   const incoming=new URL(req.url||'/', 'http://localhost');
   const target=new URL(base.toString());target.pathname=base.pathname+'/videos/'+encodeURIComponent(video[1]);
   const connection=incoming.searchParams.get('connectionId');
   if(connection){reply(res,400,{error:'Video connection id must be supplied in X-9Router-Connection-Id header.'},requestId);return true;}
   const connectionHeader=req.headers['x-9router-connection-id'];
   const headers=new Headers({Accept:'application/json'});if(key)headers.set('Authorization','Bearer '+key);
   if(typeof connectionHeader==='string'&&connectionHeader.length<=200)headers.set('x-connection-id',connectionHeader);
   const response=await fetch(target.toString(),{headers,redirect:'error',signal:AbortSignal.timeout(45_000)});
   const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2_000_000)throw new Error('Video status response exceeded the safety limit.');
   if(!response.ok){reply(res,response.status>=400&&response.status<500?response.status:502,{error:'9Router could not retrieve this video job.'},requestId);return true;}
   res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Request-Id':requestId});
   res.end(JSON.stringify({...JSON.parse(bytes.toString('utf8')),requestId}));return true;
  }
  reply(res,405,{error:'Method or 9Router capability is not supported by this proxy route.'},requestId);return true;
 }catch(error){
  const message=error instanceof Error?error.message:'9Router request failed.';
  const tooLarge=message.includes('too large')||message.includes('too_large');
  reply(res,tooLarge?413:502,{available:false,error:message.slice(0,240)},requestId);return true;
 }finally{
  const status=Number(res.statusCode)||500;
  const outcome=status>=500?'gateway_error':status===429||status===408||status===425?'upstream_error':status>=400?'client_error':'success';
  if(pool)void pool.query('INSERT INTO ninerouter_request_logs(user_id,request_id,endpoint,http_method,status_code,latency_ms,outcome) VALUES($1,$2,$3,$4,$5,$6,$7)',
   [user.id,requestId,pathname.slice(0,160),(req.method||'GET').toUpperCase(),status,Math.max(0,Date.now()-startedAt),outcome]).catch(error=>console.warn('NINEROUTER_REQUEST_LOG_FAILED',error instanceof Error?error.message:'unknown_error'));
 }
}
type Json=Record<string,any>;
