import type {IncomingMessage,ServerResponse} from 'http';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {pool} from './database.ts';
import {authenticateRequest,readJsonBody,sendAuthJson,verifyCsrf} from './auth.ts';

type Json=Record<string,any>;
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
function isPublicAddress(value:string):boolean{
 const family=isIP(value);if(!family)return false;
 if(family===4)return !blocked.check(value,'ipv4');
 const lower=value.toLowerCase();
 if(lower.startsWith('::ffff:')){const mapped=lower.slice(7);if(isIP(mapped)===4)return !blocked.check(mapped,'ipv4');}
 return !blocked.check(value,'ipv6');
}
function encryptionKey():Buffer{
 const raw=process.env.AFG_INTEGRATION_ENCRYPTION_KEY?.trim()||'';
 if(!raw)throw new Error('API connector credential encryption is not configured.');
 const key=/^[a-f0-9]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
 if(key.length!==32)throw new Error('API connector encryption key must be 32 bytes.');
 return key;
}
function encrypt(value:string):string{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join('.');
}
function decrypt(value:string):string{
 const [version,iv,tag,data]=value.split('.');
 if(version!=='v1'||!iv||!tag||!data)throw new Error('Stored credential format is invalid.');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));
 decipher.setAuthTag(Buffer.from(tag,'base64'));
 return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
}
async function readTextLimited(response:Response,maxBytes:number):Promise<string>{
 const declared=Number(response.headers.get('content-length')||0);
 if(declared>maxBytes){await response.body?.cancel().catch(()=>{});throw new Error('Remote response exceeds the '+maxBytes+' byte safety limit.');}
 if(!response.body)return '';
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   total+=part.value.byteLength;
   if(total>maxBytes){await reader.cancel().catch(()=>{});throw new Error('Remote response exceeds the '+maxBytes+' byte safety limit.');}
   chunks.push(part.value);
  }
 }finally{reader.releaseLock();}
 const merged=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder().decode(merged);
}
async function safeEndpoint(value:string):Promise<URL>{
 let url:URL;try{url=new URL(value);}catch{throw new Error('Enter a valid API endpoint URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
  url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')){
  throw new Error('API connector endpoints must be public HTTPS URLs without embedded credentials, query strings or fragments.');
 }
 if(isIP(url.hostname)){if(!isPublicAddress(url.hostname))throw new Error('Private or reserved network targets are blocked.');}
 else{
  const records=await lookup(url.hostname,{all:true,verbatim:true});
  if(!records.length||records.some(item=>!isPublicAddress(item.address)))throw new Error('API endpoint hostname resolves to a private or reserved address.');
 }
 return url;
}
function normalizeJsonProperty(input:unknown,depth=0):Json{
 if(depth>5||!input||typeof input!=='object'||Array.isArray(input))throw new Error('JSON Schema property is invalid or too deeply nested.');
 const source=input as Json;
 if(!['string','number','integer','boolean','object','array'].includes(source.type))throw new Error('API connector parameters must use supported JSON types.');
 const output:Json={type:source.type};
 if(typeof source.description==='string')output.description=source.description.slice(0,500);
 if(source['x-in']!==undefined){if(!['path','query','body','header'].includes(source['x-in']))throw new Error('API parameter location is invalid.');output['x-in']=source['x-in'];}
 if(Array.isArray(source.enum)){
  if(source.enum.length>100||source.enum.some((value:any)=>value!==null&&!['string','number','boolean'].includes(typeof value)))throw new Error('Parameter enum is invalid.');
  output.enum=source.enum;
 }
 for(const key of ['maxLength','minLength','maxItems','minItems'] as const){
  const value=source[key];if(value!==undefined){
   const max=key.startsWith('max')?10000:10000;
   if(!Number.isInteger(value)||Number(value)<0||Number(value)>max)throw new Error('Parameter '+key+' is invalid.');
   output[key]=value;
  }
 }
 for(const key of ['minimum','maximum'] as const){
  const value=source[key];if(value!==undefined){if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Parameter '+key+' is invalid.');output[key]=value;}
 }
 if(source.type==='object'){
  if(!source.properties||typeof source.properties!=='object'||Array.isArray(source.properties))throw new Error('Nested object parameters require a properties map.');
  const entries=Object.entries(source.properties as Json);if(entries.length>40)throw new Error('An object may define at most 40 properties.');
  const properties:Json={};
  for(const [key,value] of entries){
   if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)||['__proto__','prototype','constructor'].includes(key))throw new Error('JSON Schema contains an invalid property name.');
   properties[key]=normalizeJsonProperty(value,depth+1);
  }
  const required=Array.isArray(source.required)?source.required:[];
  if(required.length>40||required.some((item:any)=>typeof item!=='string'||!Object.prototype.hasOwnProperty.call(properties,item)))throw new Error('Nested object required fields are invalid.');
  output.properties=properties;output.required=required;output.additionalProperties=false;
 }else if(source.type==='array'){
  if(!source.items||typeof source.items!=='object'||Array.isArray(source.items))throw new Error('Array parameters require an items schema.');
  output.items=normalizeJsonProperty(source.items,depth+1);
 }
 return output;
}
function validateSchema(schema:unknown):Json{
 if(!schema||typeof schema!=='object'||Array.isArray(schema))throw new Error('Input schema must be a JSON object.');
 const value=schema as Json;
 if(value.type!=='object'||!value.properties||typeof value.properties!=='object'||Array.isArray(value.properties))throw new Error('Input schema must use type object and a properties map.');
 const normalized=normalizeJsonProperty(value);
 if(Object.keys(normalized.properties as Json).length>40)throw new Error('An API tool may define at most 40 input parameters.');
 return normalized;
}
function modelToolSchema(input:unknown):Json{
 const schema=validateSchema(input);
 return {...schema,additionalProperties:false};
}
function validateJsonValue(schema:Json,value:unknown,path:string,depth=0):void{
 if(depth>6)throw new Error(path+' exceeds the maximum JSON nesting depth.');
 if(schema.type==='string'){
  if(typeof value!=='string')throw new Error(path+' must be a string.');
  if(schema.maxLength!==undefined&&value.length>Number(schema.maxLength))throw new Error(path+' is too long.');
  if(schema.minLength!==undefined&&value.length<Number(schema.minLength))throw new Error(path+' is too short.');
 }else if(schema.type==='number'||schema.type==='integer'){
  if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isSafeInteger(value)))throw new Error(path+' must be a valid '+schema.type+'.');
  if(schema.minimum!==undefined&&value<Number(schema.minimum))throw new Error(path+' is below its minimum.');
  if(schema.maximum!==undefined&&value>Number(schema.maximum))throw new Error(path+' exceeds its maximum.');
 }else if(schema.type==='boolean'){
  if(typeof value!=='boolean')throw new Error(path+' must be a boolean.');
 }else if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(path+' must be an object.');
  const object=value as Json,properties=schema.properties as Json,required=schema.required as string[];
  for(const key of required)if(!Object.prototype.hasOwnProperty.call(object,key))throw new Error(path+'.'+key+' is required.');
  for(const [key,item] of Object.entries(object)){
   const child=properties[key] as Json|undefined;
   if(!child)throw new Error(path+' contains an unknown property: '+key+'.');
   validateJsonValue(child,item,path+'.'+key,depth+1);
  }
 }else if(schema.type==='array'){
  if(!Array.isArray(value))throw new Error(path+' must be an array.');
  if(schema.maxItems!==undefined&&value.length>Number(schema.maxItems))throw new Error(path+' has too many items.');
  if(schema.minItems!==undefined&&value.length<Number(schema.minItems))throw new Error(path+' has too few items.');
  for(let i=0;i<value.length;i++)validateJsonValue(schema.items as Json,value[i],path+'['+i+']',depth+1);
 }
 if(Array.isArray(schema.enum)&&!schema.enum.some((allowed:any)=>JSON.stringify(allowed)===JSON.stringify(value)))throw new Error(path+' is not an allowed value.');
}
function validateArgs(schema:Json,args:unknown):Json{
 if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Tool arguments must be a JSON object.');
 if(JSON.stringify(args).length>48_000)throw new Error('Tool arguments exceed the 48 KB limit.');
 validateJsonValue(schema,args,'arguments');
 return args as Json;
}

function publicRow(row:any){
 return {id:row.id,catalogSourceKey:row.catalog_source_key,name:row.name,toolName:row.tool_name,description:row.description,
  endpointUrl:row.endpoint_url,httpMethod:row.http_method,authType:row.auth_type,authHeaderName:row.auth_header_name,
  hasCredential:Boolean(row.credential_encrypted),inputSchema:row.input_schema_json,sampleArguments:row.sample_arguments_json,
  fallbackGroup:row.fallback_group||'',fallbackPriority:Number(row.fallback_priority||100),queueState:row.queue_state||'ready',nextAvailableAt:row.next_available_at||null,
  rateLimitEvidence:row.rate_limit_evidence||null,lastQuotaStatus:row.last_quota_status||null,lastQuotaObservedAt:row.last_quota_observed_at||null,lastQuotaResetAt:row.last_quota_reset_at||null,
  enabled:row.enabled,status:row.status,lastTestedAt:row.last_tested_at,lastHttpStatus:row.last_http_status,lastError:row.last_error};
}
async function ownerConnector(userId:string,id:string){
 const result=await pool!.query('SELECT * FROM user_api_connectors WHERE id=$1 AND user_id=$2 LIMIT 1',[id,userId]);
 return result.rows[0]||null;
}
async function execute(row:any,args:unknown,userId:string,requestId:string,timeoutMs=15_000){
 const schema=validateSchema(row.input_schema_json),values=validateArgs(schema,args);
 const base=await safeEndpoint(row.endpoint_url);
 let pathname=base.pathname;
 const query=new URLSearchParams();
 const body:Json={};
 const parameterHeaders:Record<string,string>={};
 for(const [key,value] of Object.entries(values)){
  const property=(schema.properties as Json)[key] as Json;
  const location=property['x-in']||(row.http_method==='GET'||row.http_method==='DELETE'?'query':'body');
  if(location==='path'){
   const marker='{'+key+'}';
   if(!pathname.includes(marker))throw new Error('Path template is missing {'+key+'}.');
   pathname=pathname.split(marker).join(encodeURIComponent(String(value)));
  }else if(location==='query')query.set(key,String(value));
  else if(location==='header'){
   if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(key)||/^(authorization|proxy-authorization|host|cookie|content-length|content-type|connection|transfer-encoding)$/i.test(key)||key.toLowerCase().startsWith('proxy-'))throw new Error('The API contract contains a reserved or invalid header parameter: '+key+'.');
   parameterHeaders[key]=String(value);
  }else body[key]=value;
 }
 if(/\{[a-zA-Z][a-zA-Z0-9_]*\}/.test(pathname))throw new Error('The API endpoint contains an unresolved path parameter.');
 const url=new URL(base.toString());url.pathname=pathname;
 const headers=new Headers({Accept:'application/json'});
 for(const [key,value] of Object.entries(parameterHeaders))headers.set(key,value);
 const secrets:string[]=[];
 if(row.auth_type==='bearer'||row.auth_type==='basic'||row.auth_type==='header_key'||row.auth_type==='query_key'){
  if(!row.credential_encrypted)throw new Error('API connector credential is missing.');
  const secret=decrypt(row.credential_encrypted);secrets.push(secret);
  if(row.auth_type==='query_key')query.set(String(row.auth_header_name||'api_key'),secret);
  else if(row.auth_type==='basic'){
   const separator=secret.indexOf(':');
   if(separator<1||separator===secret.length-1)throw new Error('HTTP Basic credentials must be stored as username:password.');
   headers.set('Authorization','Basic '+Buffer.from(secret,'utf8').toString('base64'));
  }else {const key=row.auth_type==='bearer'?'Authorization':String(row.auth_header_name||'X-API-Key');headers.set(key,row.auth_type==='bearer'?'Bearer '+secret:secret);}
 }
 if(query.size)url.search=query.toString();
 const init:RequestInit={method:row.http_method,headers,redirect:'error',signal:AbortSignal.timeout(timeoutMs)};
 if(['POST','PUT','PATCH'].includes(row.http_method)){headers.set('Content-Type','application/json');init.body=JSON.stringify(body);}
 const started=Date.now();
 let response:Response;
 try{response=await fetch(url.toString(),init);}catch(error){
  if(error instanceof Error&&error.name==='TimeoutError')throw Object.assign(new Error('The API endpoint timed out.'),{retryable:true});
  throw Object.assign(new Error('The API endpoint could not be reached.'),{retryable:true});
 }
 const durationMs=Date.now()-started;
 const rateLimitEvidence=readRateLimitEvidence(response);
 const retryAt=parseUpstreamResetAt(response);
 const raw=await readTextLimited(response,1_000_000);
 const safeRaw=secrets.reduce((value,secret)=>value.split(secret).join('[redacted]'),raw);
 let data:unknown=safeRaw;
 if(safeRaw){try{data=JSON.parse(safeRaw);}catch{}}
 if(!response.ok){
  if(![402,429].includes(response.status))await persistRateLimitObservation(row,userId,rateLimitEvidence,null,null);
  throw Object.assign(new Error('The external API returned HTTP '+response.status+'.'),{
   httpStatus:response.status,durationMs,retryAt:retryAt||undefined,rateLimitEvidence
  });
 }
 await persistRateLimitObservation(row,userId,rateLimitEvidence,null,null);
 await pool!.query(`INSERT INTO user_api_connector_runs(connector_id,user_id,request_id,http_method,http_status,duration_ms,outcome)
  VALUES($1,$2,$3,$4,$5,$6,'success')`,[row.id,userId,requestId,row.http_method,response.status,durationMs]);
 return {data,status:response.status,durationMs};
}
async function reserveConnectorCall(userId:string,connectorId:string):Promise<boolean>{
 const counter=await pool!.query(`INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
  VALUES('user',$1,to_timestamp((floor(extract(epoch FROM now())/60)*60)::double precision),1)
  ON CONFLICT(scope_type,scope_key,window_start) DO UPDATE SET request_count=rate_limit_counters.request_count+1 RETURNING request_count`,
  ['api-connector:'+userId+':'+connectorId]);
 return Number(counter.rows[0]?.request_count||0)<=30;
}

const RATE_LIMIT_HEADERS=[
 'retry-after','ratelimit-limit','ratelimit-remaining','ratelimit-reset','ratelimit-reset-after','ratelimit-policy',
 'x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset','x-ratelimit-reset-after',
 'x-rate-limit-limit','x-rate-limit-remaining','x-rate-limit-reset','x-rate-limit-reset-after'
] as const;
function readRateLimitEvidence(response:Response):Json{
 const headers:Json={};
 for(const name of RATE_LIMIT_HEADERS){
  const value=response.headers.get(name);
  if(value!==null)headers[name]=value.slice(0,256);
 }
 return {source:'upstream_response',observedAt:new Date().toISOString(),httpStatus:response.status,headers};
}
function parseUpstreamResetAt(response:Response,now=Date.now()):number|null{
 const retry=response.headers.get('retry-after');
 if(retry){
  const seconds=Number(retry);
  const parsed=Number.isFinite(seconds)&&seconds>0?now+seconds*1000:Date.parse(retry);
  if(Number.isFinite(parsed)&&parsed>now&&parsed<=now+366*24*60*60*1000)return parsed;
 }
 for(const name of ['ratelimit-reset','x-ratelimit-reset','x-rate-limit-reset','ratelimit-reset-after','x-ratelimit-reset-after','x-rate-limit-reset-after']){
  const value=response.headers.get(name);if(!value)continue;
  const numeric=Number(value);
  const parsed=Number.isFinite(numeric)
   ?(name.endsWith('reset-after')?now+numeric*1000:numeric>10_000_000_000?numeric:numeric>1_000_000_000?numeric*1000:now+numeric*1000)
   :Date.parse(value);
  if(Number.isFinite(parsed)&&parsed>now&&parsed<=now+366*24*60*60*1000)return parsed;
 }
 return null;
}
async function persistRateLimitObservation(row:any,userId:string,evidence:Json,quotaStatus:number|null,resetAt:number|null):Promise<void>{
 await pool!.query(`UPDATE user_api_connectors SET rate_limit_evidence=$3::jsonb,
  last_quota_status=CASE WHEN $4::int IS NULL THEN last_quota_status ELSE $4::int END,
  last_quota_observed_at=CASE WHEN $4::int IS NULL THEN last_quota_observed_at ELSE now() END,
  last_quota_reset_at=CASE WHEN $4::int IS NULL THEN last_quota_reset_at ELSE $5::timestamptz END,
  updated_at=now() WHERE id=$1 AND user_id=$2`,
  [row.id,userId,JSON.stringify(evidence),quotaStatus,resetAt?new Date(resetAt):null]).catch(error=>{
   console.warn('AFG_API_CONNECTOR_RATE_LIMIT_OBSERVATION_FAILED',JSON.stringify({connectorId:row.id,error:error instanceof Error?error.message:'unknown'}));
  });
}
function isQuotaFailure(error:unknown):boolean{return [402,429].includes(Number((error as {httpStatus?:number})?.httpStatus||0));}
async function refreshDueQueueEntries(userId:string):Promise<void>{
 await pool!.query(`UPDATE user_api_connectors SET queue_state='ready',next_available_at=NULL,last_error=NULL,updated_at=now()
  WHERE user_id=$1 AND queue_state='waiting' AND next_available_at IS NOT NULL AND next_available_at<=now()`,[userId]);
}
async function parkQuotaLimitedConnector(row:any,userId:string,error:unknown):Promise<void>{
 if(!isQuotaFailure(error))return;
 const value=error as {retryAt?:number;httpStatus?:number;rateLimitEvidence?:Json};
 const retryAt=Number(value.retryAt||0);
 const next=retryAt>Date.now()?new Date(retryAt):null;
 const evidence=value.rateLimitEvidence||{source:'upstream_response',observedAt:new Date().toISOString(),httpStatus:value.httpStatus||null,headers:{}};
 await pool!.query(`UPDATE user_api_connectors SET queue_state='waiting',next_available_at=$3,
  rate_limit_evidence=$4::jsonb,last_quota_status=$5,last_quota_observed_at=now(),last_quota_reset_at=$3,updated_at=now()
  WHERE id=$1 AND user_id=$2`,[row.id,userId,next,JSON.stringify(evidence),Number(value.httpStatus)||null]);
}
function isRetryableUpstreamFailure(error:unknown):boolean{
 const value=error as {httpStatus?:number;retryable?:boolean};
 if(value?.retryable===true)return true;
 return [402,408,425,429,500,502,503,504].includes(Number(value?.httpStatus||0));
}
async function recordConnectorFailure(row:any,userId:string,requestId:string,error:unknown):Promise<void>{
 const value=error as {httpStatus?:number;durationMs?:number};
 const message=error instanceof Error?error.message.slice(0,250):'API connector call failed.';
 await pool!.query(`INSERT INTO user_api_connector_runs(connector_id,user_id,request_id,http_method,http_status,duration_ms,outcome,error_code)
  VALUES($1,$2,$3,$4,$5,$6,'error',$7)`,
  [row.id,userId,requestId,row.http_method,Number(value?.httpStatus)||null,Math.max(0,Number(value?.durationMs)||0),message]).catch(()=>{});
}
async function executeConnectorWithFallback(row:any,args:unknown,userId:string,requestId:string){
 try{return {...await execute(row,args,userId,requestId,10_000),connectorId:row.id,connectorName:row.name,fallbackUsed:false};}
 catch(primaryError){
  await recordConnectorFailure(row,userId,requestId,primaryError);
  await parkQuotaLimitedConnector(row,userId,primaryError);
  if(!row.fallback_group||!isRetryableUpstreamFailure(primaryError))throw primaryError;
  const alternatives=await pool!.query(`SELECT * FROM user_api_connectors
   WHERE user_id=$1 AND fallback_group=$2 AND id<>$3 AND enabled=true AND status='verified'
    AND queue_state='ready' AND http_method=$4 AND input_schema_json=$5::jsonb AND endpoint_url<>$6
   ORDER BY fallback_priority ASC,created_at ASC LIMIT 8`,
   [userId,row.fallback_group,row.id,row.http_method,JSON.stringify(row.input_schema_json),row.endpoint_url]);
  let lastError:unknown=primaryError;
  for(const candidate of alternatives.rows){
   if(!await reserveConnectorCall(userId,candidate.id))continue;
   try{
    const result=await execute(candidate,args,userId,requestId,10_000);
    console.info('AFG_API_CONNECTOR_FALLBACK',JSON.stringify({requestId,userId,group:row.fallback_group,from:row.id,to:candidate.id,outcome:'success'}));
    return {...result,connectorId:candidate.id,connectorName:candidate.name,fallbackUsed:true,fallbackFrom:row.name};
   }catch(error){
    lastError=error;
    await recordConnectorFailure(candidate,userId,requestId,error);
    await parkQuotaLimitedConnector(candidate,userId,error);
    if(!isRetryableUpstreamFailure(error))break;
   }
  }
  console.warn('AFG_API_CONNECTOR_FALLBACK_EXHAUSTED',JSON.stringify({requestId,userId,group:row.fallback_group,outcome:'failed'}));
  throw lastError;
 }
}

export async function getEnabledUserApiToolDefinitions(userId:string){
 if(!pool||!userId)return [];
 try{
  await refreshDueQueueEntries(userId);
  const result=await pool.query(`SELECT tool_name,description,input_schema_json,fallback_group FROM user_api_connectors
   WHERE user_id=$1 AND enabled=true AND status='verified' AND queue_state='ready' ORDER BY fallback_priority ASC,created_at DESC LIMIT 32`,[userId]);
  return result.rows.map(row=>({
   type:'function' as const,
   function:{
    name:String(row.tool_name),
    description:(String(row.description||'Call the configured API connector '+row.tool_name)+(row.fallback_group?' Compatible fallback group: '+row.fallback_group+'. The executor automatically tries verified alternatives in this group on retryable upstream failures.':'' )).slice(0,1000),
    parameters:modelToolSchema(row.input_schema_json),
   },
  }));
 }catch(error){
  console.warn('AFG_API_CONNECTOR_TOOL_DISCOVERY_UNAVAILABLE',JSON.stringify({error:error instanceof Error?error.message:'unknown'}));
  return [];
 }
}

export async function executeUserApiTool(userId:string,toolName:string,args:unknown){
 if(!pool||!userId)throw new Error('Sign in to use personal API connectors.');
 await refreshDueQueueEntries(userId);
 const found=await pool.query(`SELECT * FROM user_api_connectors WHERE user_id=$1 AND tool_name=$2
  AND enabled=true AND status='verified' AND queue_state='ready' LIMIT 1`,[userId,toolName]);
 const row=found.rows[0];
 if(!row)throw new Error('This API connector is no longer enabled for your account.');
 if(!await reserveConnectorCall(userId,row.id))throw new Error('This API connector has reached its limit of 30 calls per minute.');
 const requestId=randomUUID();
 const result=await executeConnectorWithFallback(row,args,userId,requestId);
 const serialized=JSON.stringify(result.data);
 if(serialized.length>16_000)return {...result,truncated:true,responsePreview:serialized.slice(0,16_000)};
 return result;
}

async function audit(userId:string,action:string,id:string,metadata:Json={}){
 await pool!.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
  [userId,action,'api_connector',id,JSON.stringify(metadata)]).catch(()=>{});
}
export async function handleUserApiConnectorApi(req:IncomingMessage,res:ServerResponse,pathname:string):Promise<boolean>{
 if(!pathname.startsWith('/api/api-hub/connectors'))return false;
 if(!pool){sendAuthJson(res,503,{error:'API connectors require PostgreSQL and migrations 0014, 0023 and 0027.'});return true;}
 const user=await authenticateRequest(req).catch(()=>null);
 if(!user){sendAuthJson(res,401,{error:'Sign in is required.'});return true;}
 if(req.method!=='GET'&&!verifyCsrf(req)){sendAuthJson(res,403,{error:'CSRF validation failed.'});return true;}
 try{
  if(req.method==='GET'&&pathname==='/api/api-hub/connectors'){
   await refreshDueQueueEntries(user.id);
   const result=await pool.query('SELECT * FROM user_api_connectors WHERE user_id=$1 ORDER BY CASE WHEN queue_state=\'ready\' THEN 0 ELSE 1 END,fallback_priority ASC,created_at DESC',[user.id]);
   sendAuthJson(res,200,{connectors:result.rows.map(publicRow),encryptionConfigured:Boolean(process.env.AFG_INTEGRATION_ENCRYPTION_KEY)});return true;
  }
  if(req.method==='POST'&&pathname==='/api/api-hub/connectors'){
   const body=await readJsonBody(req,60_000);
   const name=String(body.name||'').trim(),toolName=String(body.toolName||'').trim().toLowerCase();
   const description=String(body.description||'').trim(),endpoint=String(body.endpointUrl||'').trim();
   const method=String(body.method||'GET').toUpperCase(),authType=String(body.authType||'none');
   const authHeader=String(body.authHeaderName||'X-API-Key');
   const fallbackGroup=String(body.fallbackGroup||'').trim().toLowerCase();
   const fallbackPriority=Number(body.fallbackPriority??100);
   const secret=typeof body.credential==='string'?body.credential.trim():'';
   if(name.length<2||name.length>120||!/^[a-z][a-z0-9_]{1,63}$/.test(toolName)||description.length>2000||
    !['GET','POST','PUT','PATCH','DELETE'].includes(method)||!['none','bearer','basic','header_key','query_key'].includes(authType)||
    (authType==='none'&&secret)||(authType!=='none'&&!secret)||
    ((authType==='header_key'||authType==='query_key')&&!/^[A-Za-z0-9_.-]{1,64}$/.test(authHeader))||
    (fallbackGroup&&!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(fallbackGroup))||!Number.isInteger(fallbackPriority)||fallbackPriority<1||fallbackPriority>1000){
    sendAuthJson(res,400,{error:'Invalid API connector settings.'});return true;
   }
   await safeEndpoint(endpoint);
   const schema=validateSchema(body.inputSchema||{type:'object',properties:{},required:[],additionalProperties:false});
   const sample=validateArgs(schema,body.sampleArguments||{});
   const sourceKey=typeof body.catalogSourceKey==='string'?body.catalogSourceKey:null;
   if(sourceKey){const exists=await pool.query('SELECT 1 FROM public_api_catalog WHERE source_key=$1',[sourceKey]);if(!exists.rows[0]){sendAuthJson(res,404,{error:'Public API catalog entry was not found.'});return true;}}
   const encrypted=secret?encrypt(secret):null;
   const created=await pool.query(`INSERT INTO user_api_connectors(user_id,catalog_source_key,name,tool_name,description,endpoint_url,http_method,auth_type,auth_header_name,credential_encrypted,input_schema_json,sample_arguments_json,fallback_group,fallback_priority)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14) RETURNING *`,
    [user.id,sourceKey,name,toolName,description,endpoint,method,authType,authHeader,encrypted,JSON.stringify(schema),JSON.stringify(sample),fallbackGroup||null,fallbackPriority]);
   await audit(user.id,'api.connector.create',created.rows[0].id,{toolName,method,authType});
   sendAuthJson(res,201,{connector:publicRow(created.rows[0])});return true;
  }
  const credentialMatch=pathname.match(/^\/api\/api-hub\/connectors\/([0-9a-f-]{36})\/credentials$/i);
  if(req.method==='POST'&&credentialMatch){
   const row=await ownerConnector(user.id,credentialMatch[1]);
   if(!row){sendAuthJson(res,404,{error:'API connector not found.'});return true;}
   if(row.auth_type==='none'){sendAuthJson(res,409,{error:'This API connector is configured without authentication. Change its documented authentication method by creating a new connector.'});return true;}
   const body=await readJsonBody(req,12_000);
   const secret=typeof body.credential==='string'?body.credential.trim():'';
   if(!secret||secret.length>8192){sendAuthJson(res,400,{error:'A credential between 1 and 8192 characters is required.'});return true;}
   const encrypted=encrypt(secret);
   await pool.query(`UPDATE user_api_connectors SET credential_encrypted=$3,enabled=false,status='error',
    queue_state='ready',next_available_at=NULL,last_error='Credential updated; verify the connector before enabling it.',updated_at=now()
    WHERE id=$1 AND user_id=$2`,[row.id,user.id,encrypted]);
   await audit(user.id,'api.connector.credential_rotated',row.id,{authType:row.auth_type,requiresVerification:true});
   sendAuthJson(res,200,{updated:true,verified:false,enabled:false,requiresVerification:true});return true;
  }
  const testMatch=pathname.match(/^\/api\/api-hub\/connectors\/([0-9a-f-]{36})\/test$/i);
  if(req.method==='POST'&&testMatch){
   const row=await ownerConnector(user.id,testMatch[1]);if(!row){sendAuthJson(res,404,{error:'API connector not found.'});return true;}
   const requestId=randomUUID();
   try{
    const result=await execute(row,row.sample_arguments_json,user.id,requestId);
    await pool.query(`UPDATE user_api_connectors SET status='verified',queue_state='ready',next_available_at=NULL,enabled=false,last_tested_at=now(),last_http_status=$3,last_error=NULL,updated_at=now() WHERE id=$1 AND user_id=$2`,
     [row.id,user.id,result.status]);
    await audit(user.id,'api.connector.verify',row.id,{status:result.status,durationMs:result.durationMs});
    sendAuthJson(res,200,{verified:true,httpStatus:result.status,durationMs:result.durationMs});return true;
   }catch(error){
    const status=Number((error as any)?.httpStatus)||null;
    const message=error instanceof Error?error.message.slice(0,250):'API connector verification failed.';
    await pool.query(`UPDATE user_api_connectors SET enabled=false,status='error',queue_state=CASE WHEN $3 IN (402,429) THEN 'waiting' ELSE queue_state END,
     next_available_at=CASE WHEN $3 IN (402,429) THEN $5 ELSE next_available_at END,
     rate_limit_evidence=CASE WHEN $3 IN (402,429) THEN $6::jsonb ELSE rate_limit_evidence END,
     last_quota_status=CASE WHEN $3 IN (402,429) THEN $3 ELSE last_quota_status END,
     last_quota_observed_at=CASE WHEN $3 IN (402,429) THEN now() ELSE last_quota_observed_at END,
     last_quota_reset_at=CASE WHEN $3 IN (402,429) THEN $5 ELSE last_quota_reset_at END,
     last_tested_at=now(),last_http_status=$3,last_error=$4,updated_at=now() WHERE id=$1 AND user_id=$2`,
     [row.id,user.id,status,message,(error as any)?.retryAt?new Date((error as any).retryAt):null,JSON.stringify((error as any)?.rateLimitEvidence||{source:'upstream_response',observedAt:new Date().toISOString(),httpStatus:status,headers:{}})]);
    await audit(user.id,'api.connector.verify_failed',row.id,{status,error:message});
    sendAuthJson(res,502,{verified:false,error:message});return true;
   }
  }
  const itemMatch=pathname.match(/^\/api\/api-hub\/connectors\/([0-9a-f-]{36})$/i);
  if(itemMatch&&req.method==='PATCH'){
   const body=await readJsonBody(req,2000);
   if(typeof body.enabled!=='boolean'){sendAuthJson(res,400,{error:'enabled must be boolean.'});return true;}
   const updated=await pool.query(`UPDATE user_api_connectors SET enabled=$3,status=CASE WHEN $3 THEN 'verified' ELSE 'disabled' END,queue_state=CASE WHEN $3 THEN 'ready' ELSE queue_state END,next_available_at=CASE WHEN $3 THEN NULL ELSE next_available_at END,updated_at=now()
    WHERE id=$1 AND user_id=$2 AND ($3=false OR status='verified') RETURNING id,enabled,status`,[itemMatch[1],user.id,body.enabled]);
   if(!updated.rows[0]){sendAuthJson(res,409,{error:'Only a verified API connector can be enabled.'});return true;}
   await audit(user.id,'api.connector.toggle',itemMatch[1],{enabled:body.enabled});
   sendAuthJson(res,200,{connector:updated.rows[0]});return true;
  }
  if(itemMatch&&req.method==='DELETE'){
   const deleted=await pool.query('DELETE FROM user_api_connectors WHERE id=$1 AND user_id=$2 RETURNING id',[itemMatch[1],user.id]);
   if(!deleted.rows[0]){sendAuthJson(res,404,{error:'API connector not found.'});return true;}
   await audit(user.id,'api.connector.delete',itemMatch[1]);
   sendAuthJson(res,200,{deleted:true});return true;
  }
  const callMatch=pathname.match(/^\/api\/api-hub\/connectors\/([0-9a-f-]{36})\/call$/i);
  if(req.method==='POST'&&callMatch){
   await refreshDueQueueEntries(user.id);
   const row=await ownerConnector(user.id,callMatch[1]);
   if(!row||!row.enabled||row.status!=='verified'||row.queue_state!=='ready'){sendAuthJson(res,409,{error:row?.queue_state==='waiting'?'API connector is waiting for its upstream quota reset.':'API connector is not verified and enabled.'});return true;}
   if(!await reserveConnectorCall(user.id,row.id)){sendAuthJson(res,429,{error:'API connector limit is 30 calls per minute.'});return true;}
   const requestId=randomUUID(),body=await readJsonBody(req,60_000);
   try{
    const result=await executeConnectorWithFallback(row,body.arguments||{},user.id,requestId);
    sendAuthJson(res,200,{requestId,result});return true;
   }catch(error){
    const message=error instanceof Error?error.message.slice(0,250):'API connector call failed.';
    sendAuthJson(res,502,{requestId,error:message});return true;
   }
  }
  sendAuthJson(res,404,{error:'API connector route not found.'});return true;
 }catch(error){
  const message=error instanceof Error?error.message.slice(0,300):'API connector operation failed.';
  sendAuthJson(res,400,{error:message});return true;
 }
}
