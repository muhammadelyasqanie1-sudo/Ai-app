import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';

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
function publicAddress(value:string):boolean{
 const family=isIP(value);if(!family)return false;
 if(family===4)return !blocked.check(value,'ipv4');
 const lower=value.toLowerCase();
 if(lower.startsWith('::ffff:')){const mapped=lower.slice(7);if(isIP(mapped)===4)return !blocked.check(mapped,'ipv4');}
 return !blocked.check(value,'ipv6');
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
async function safeSpecUrl(value:string):Promise<URL>{
 let url:URL;try{url=new URL(value);}catch{throw new Error('Enter a valid OpenAPI JSON document URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.hostname==='localhost'||
  url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal'))
  throw new Error('OpenAPI documents must use a public HTTPS URL without embedded credentials or fragments.');
 if(isIP(url.hostname)){if(!publicAddress(url.hostname))throw new Error('Private or reserved OpenAPI document hosts are blocked.');}
 else{
  const records=await lookup(url.hostname,{all:true,verbatim:true});
  if(!records.length||records.some(item=>!publicAddress(item.address)))throw new Error('OpenAPI document host resolves to a private or reserved address.');
 }
 return url;
}
function resolveLocalRef(document:Json,value:unknown):Json|null{
 if(typeof value!=='string'||!value.startsWith('#/'))return null;
 let current:any=document;
 for(const part of value.slice(2).split('/')){
  const key=part.replace(/~1/g,'/').replace(/~0/g,'~');
  if(!current||typeof current!=='object'||!Object.prototype.hasOwnProperty.call(current,key))return null;
  current=current[key];
 }
 return current&&typeof current==='object'&&!Array.isArray(current)?current:null;
}
function primitiveSchema(document:Json,input:unknown,depth=0):Json|null{
 if(!input||typeof input!=='object'||Array.isArray(input)||depth>4)return null;
 let schema=input as Json;
 if(typeof schema.$ref==='string'){const resolved=resolveLocalRef(document,schema.$ref);if(!resolved)return null;schema=resolved;}
 const type=Array.isArray(schema.type)?schema.type.find((item:string)=>item!=='null'):schema.type;
 if(!['string','integer','number','boolean'].includes(type))return null;
 const output:Json={type};
 if(typeof schema.description==='string')output.description=schema.description.slice(0,500);
 if(Array.isArray(schema.enum))output.enum=schema.enum.slice(0,100).filter((item:any)=>['string','number','boolean'].includes(typeof item));
 if(Number.isInteger(schema.maxLength))output.maxLength=Math.max(0,Math.min(10000,schema.maxLength));
 return output;
}
function makeToolName(value:string,path:string,method:string):string{
 const base=(value||'api').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'api';
 const suffix=(method+'_'+path.replace(/[{}]/g,'')).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(-24)||'operation';
 const prefix=base.slice(0,Math.max(1,63-suffix.length-1));
 const name=(prefix+'_'+suffix).slice(0,64);
 return /^[a-z]/.test(name)?name:'api_'+name.slice(0,60);
}
function authSummary(document:Json,operation:Json):string[]{
 const requirements=operation.securityRequirements??document.security??[];
 if(!Array.isArray(requirements)||!requirements.length)return ['none'];
 const schemes=document.components?.securitySchemes||{};
 const result:string[]=[];
 for(const requirement of requirements){
  if(!requirement||typeof requirement!=='object')continue;
  for(const name of Object.keys(requirement)){
   const scheme=schemes[name];if(!scheme)continue;
   if(scheme.type==='http'&&String(scheme.scheme).toLowerCase()==='bearer')result.push('bearer');
   else if(scheme.type==='apiKey'&&scheme.in==='header')result.push('header_key:'+String(scheme.name||'X-API-Key'));
   else if(scheme.type==='apiKey'&&scheme.in==='query')result.push('query_key:'+String(scheme.name||'api_key'));
   else result.push('oauth_or_unsupported:'+String(scheme.type||'unknown'));
  }
 }
 return [...new Set(result.length?result:['unknown'])];
}
function operationSchema(document:Json,operation:Json,pathItem:Json):{schema:Json;required:string[];unsupported:string[]}{
 const properties:Json={};const required=new Set<string>();const unsupported:string[]=[];
 const parameters=[...(Array.isArray(pathItem.parameters)?pathItem.parameters:[]),...(Array.isArray(operation.parameters)?operation.parameters:[])];
 for(const parameter of parameters){
  if(!parameter||typeof parameter!=='object')continue;
  const name=String(parameter.name||'').trim(),location=String(parameter.in||'');
  if(!name||!['path','query','header','cookie'].includes(location))continue;
  if(location==='header'||location==='cookie'){unsupported.push(location+':'+name);continue;}
  const schema=primitiveSchema(document,parameter.schema);
  if(!schema){unsupported.push(location+':'+name);continue;}
  schema['x-in']=location;properties[name]=schema;if(parameter.required===true)required.add(name);
 }
 const body=operation.requestBody;
 if(body&&typeof body==='object'){
  const media=body.content?.['application/json']||body.content?.['application/*+json'];
  if(media?.schema){
   let schema:any=media.schema;
   if(typeof schema.$ref==='string')schema=resolveLocalRef(document,schema.$ref)||{};
   if(schema.type==='object'&&schema.properties&&typeof schema.properties==='object'){
    for(const [name,value] of Object.entries(schema.properties)){
     const property=primitiveSchema(document,value);if(!property){unsupported.push('body:'+name);continue;}
     property['x-in']='body';properties[name]=property;
    }
    if(Array.isArray(schema.required))for(const name of schema.required)if(typeof name==='string'&&properties[name])required.add(name);
   }else unsupported.push('requestBody:non_flat_json_schema');
  }else unsupported.push('requestBody:unsupported_content_type');
  if(body.required===true&&Object.keys(properties).length===0)unsupported.push('requestBody:required_but_unsupported');
 }
 return {schema:{type:'object',properties,required:[...required],additionalProperties:false},required:[...required],unsupported};
}

function boundedText(value:unknown,max=500):string|null{
 if(typeof value!=='string')return null;
 const clean=value.replace(/\\s+/g,' ').trim();
 return clean?clean.slice(0,max):null;
}
function governanceEvidence(document:Json,operations:any[]){
 const schemes=document.components?.securitySchemes&&typeof document.components.securitySchemes==='object'?document.components.securitySchemes:{};
 const authentication=Object.entries(schemes).slice(0,40).map(([name,value]:[string,any])=>{
  const type=String(value?.type||'unknown');
  const item:any={name:name.slice(0,100),type};
  if(type==='apiKey'){
   item.location=['header','query','cookie'].includes(value.in)?value.in:'unknown';
   item.parameterName=boundedText(value.name,120);
  }else if(type==='http'){
   item.scheme=boundedText(value.scheme,40);
   item.bearerFormat=boundedText(value.bearerFormat,40);
  }else if(type==='oauth2'){
   const flows=value.flows&&typeof value.flows==='object'?value.flows:{};
   item.flows=Object.entries(flows).slice(0,6).map(([flowName,flow]:[string,any])=>({
    name:flowName,authorizationUrl:boundedText(flow?.authorizationUrl,500),
    tokenUrl:boundedText(flow?.tokenUrl,500),refreshUrl:boundedText(flow?.refreshUrl,500),
    scopes:Object.keys(flow?.scopes||{}).slice(0,50)
   }));
  }else if(type==='openIdConnect')item.openIdConnectUrl=boundedText(value.openIdConnectUrl,500);
  return item;
 });
 const effectiveSecurity=(operation:any)=>{
  const requirements=operation.security??document.security??[];
  if(!Array.isArray(requirements))return {status:'unknown',alternatives:[]};
  if(!requirements.length)return {status:'none',alternatives:[]};
  return {status:'required',alternatives:requirements.slice(0,20).map((entry:any)=>({
   schemes:Object.entries(entry||{}).slice(0,20).map(([scheme,scopes]:[string,any])=>({
    name:String(scheme).slice(0,100),scopes:Array.isArray(scopes)?scopes.filter((x:any)=>typeof x==='string').slice(0,50):[]
   }))
  }))};
 };
 const operationsAuth=operations.map((operation:any)=>({
  operationId:operation.operationId||operation.toolName,
  method:operation.method,path:operation.endpointUrl,
  security:effectiveSecurity({securityRequirements:operation.securityRequirements})
 }));
 const rateHeaders=new Set<string>();
 const rateEvidence:any[]=[];
 const scanObject=(value:any,path:string,depth=0)=>{
  if(!value||typeof value!=='object'||depth>5)return;
  for(const [key,child] of Object.entries(value)){
   const next=path?path+'.'+key:key;
   if(/^(retry-after|ratelimit-(limit|remaining|reset|reset-after)|x-ratelimit-[a-z0-9_-]+)$/i.test(key)){
    rateHeaders.add(key.toLowerCase());
    rateEvidence.push({kind:'declared_header',name:key,source:next,description:boundedText((child as any)?.description)});
   }
   if(/^x-(rate.?limit|quota|throttle)/i.test(key)&&child!==null&&typeof child!=='object')
    rateEvidence.push({kind:'explicit_extension',name:key,value:typeof child==='string'||typeof child==='number'?String(child).slice(0,120):undefined,source:next});
   if(/(rate.?limit|quota|throttl|retry.after|reset)/i.test(key)&&child&&typeof child==='object')
    scanObject(child,next,depth+1);
   else if(typeof child==='string'&&/(rate.?limit|quota|throttl|retry.after|reset)/i.test(child))
    rateEvidence.push({kind:'documentation_text',source:next,text:child.slice(0,400)});
  }
 };
 scanObject(document,'openapi');
 const responseHeaders:any[]=[];
 const declaredParameters:any[]=[];
 for(const [path,pathItem] of Object.entries(document.paths||{})){
  if(!pathItem||typeof pathItem!=='object')continue;
  for(const method of ['get','post','put','patch','delete']){
   const op=(pathItem as any)[method];if(!op||typeof op!=='object')continue;
   for(const parameter of [...((pathItem as any).parameters||[]),...(op.parameters||[])]){
    if(String(parameter?.in||'')==='header'&&/^(retry-after|ratelimit-|x-ratelimit-)/i.test(String(parameter?.name||''))){
     rateHeaders.add(String(parameter.name).toLowerCase());
     declaredParameters.push({method:method.toUpperCase(),path,name:String(parameter.name),description:boundedText(parameter.description)});
    }
   }
   for(const [status,response] of Object.entries(op.responses||{})){
    const headers=(response as any)?.headers||{};
    for(const [headerName,header] of Object.entries(headers)){
     if(/^(retry-after|ratelimit-|x-ratelimit-)/i.test(headerName)){
      rateHeaders.add(headerName.toLowerCase());
      responseHeaders.push({method:method.toUpperCase(),path,status,name:headerName,description:boundedText((header as any)?.description)});
     }
    }
   }
  }
 }
 for(const item of responseHeaders)rateEvidence.push({kind:'response_header',...item});
 for(const item of declaredParameters)rateEvidence.push({kind:'declared_parameter_header',...item});
 const descriptions:string[]=[];
 const collectText=(value:any,path:string,depth=0)=>{
  if(depth>5||!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(typeof child==='string'&&/(rate.?limit|quota|throttl|retry.after|reset)/i.test(child))
    descriptions.push(path+'.'+key+': '+child.slice(0,400));
   else if(child&&typeof child==='object')collectText(child,path+'.'+key,depth+1);
  }
 };
 collectText(document,'openapi');
 return {
  authentication:{status:authentication.length?'schemes_declared':'unknown',schemes:authentication,operationRequirements:operationsAuth},
  rateLimits:{status:rateEvidence.length?'explicit_evidence_found':'unknown',headers:[...rateHeaders].slice(0,40),evidence:rateEvidence.slice(0,100),documentationHints:descriptions.slice(0,50),observedLiveQuota:null},
  servers:Array.isArray(document.servers)?document.servers.slice(0,10).map((server:any)=>({url:boundedText(server?.url,500),description:boundedText(server?.description,300)})):[]
 };
}

export async function discoverOpenApiOperations(specUrl:string){
 const url=await safeSpecUrl(specUrl);
 const response=await fetch(url.toString(),{headers:{Accept:'application/vnd.oai.openapi+json, application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
 if(!response.ok)throw new Error('OpenAPI document returned HTTP '+response.status+'.');
 const raw=await readTextLimited(response,2_000_000);
 let document:Json;try{document=JSON.parse(raw);}catch{throw new Error('Only JSON-formatted OpenAPI documents are currently supported.');}
 if(!document||typeof document!=='object'||!/^3\.(0|1)\./.test(String(document.openapi||''))||!document.paths||typeof document.paths!=='object')
  throw new Error('The document is not a supported OpenAPI 3.0 or 3.1 JSON specification.');
 const rootServer=Array.isArray(document.servers)?document.servers[0]?.url:null;
 const operations:any[]=[];
 for(const [path,pathItemValue] of Object.entries(document.paths as Json)){
  if(!pathItemValue||typeof pathItemValue!=='object'||Array.isArray(pathItemValue))continue;
  const pathItem=pathItemValue as Json;
  const server=Array.isArray(pathItem.servers)?pathItem.servers[0]?.url:rootServer;
  if(typeof server!=='string'||!server.startsWith('https://')||server.includes('{'))continue;
  let base:URL;try{base=await safeSpecUrl(server);}catch{continue;}
  if(base.search||base.pathname.includes('..'))continue;
  for(const method of ['get','post','put','patch','delete']){
   const operation=pathItem[method];if(!operation||typeof operation!=='object')continue;
   const built=operationSchema(document,operation,pathItem);
   const auth=authSummary(document,operation);
   const operationPath=String(path);
   const endpoint=new URL(operationPath.replace(/^\//,''),base.toString().replace(/\/$/,'')+'/').toString();
   operations.push({
    operationId:String(operation.operationId||'').slice(0,120),
    toolName:makeToolName(String(operation.operationId||''),operationPath,method),
    name:String(operation.summary||operation.operationId||method.toUpperCase()+' '+operationPath).slice(0,160),
    description:String(operation.description||operation.summary||'Imported from an OpenAPI document.').slice(0,1000),
    tags:Array.isArray(operation.tags)?operation.tags.filter((tag:any)=>typeof tag==='string').slice(0,12).map((tag:string)=>tag.slice(0,80)):[],
    deprecated:operation.deprecated===true,
    method:method.toUpperCase(),endpointUrl:endpoint,inputSchema:built.schema,
    authOptions:auth,securityRequirements:operation.security??document.security??[],unsupportedParameters:built.unsupported,
    usable:built.unsupported.length===0&&auth.every(item=>['none','bearer'].includes(item)||item.startsWith('header_key:')||item.startsWith('query_key:')),
   });
   if(operations.length>=100)break;
  }
  if(operations.length>=100)break;
 }
 return {specTitle:String(document.info?.title||'OpenAPI service').slice(0,160),specVersion:String(document.info?.version||'').slice(0,40),specUrl:url.toString(),operationCount:operations.length,operations,governance:governanceEvidence(document,operations)};
}

export type OfficialDocsDiscovery = {
 docsUrl:string;
 title:string|null;
 protocolTypes:string[];
 authTypes:string[];
 openApiCandidates:string[];
 evidence:string[];
};

export async function discoverOfficialDocumentation(docsUrl:string,homepageUrl:string|null):Promise<OfficialDocsDiscovery>{
 const docs=await safeSpecUrl(docsUrl);
 if(homepageUrl){
  const home=await safeSpecUrl(homepageUrl);
  if(home.hostname.toLowerCase()!==docs.hostname.toLowerCase())
   throw new Error('Documentation host does not match the catalogue homepage host; manual review is required.');
 }
 const response=await fetch(docs.toString(),{
  headers:{Accept:'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8','User-Agent':'AFG-AI-API-Hub/1.0'},
  redirect:'error',signal:AbortSignal.timeout(12_000),
 });
 if(!response.ok)throw new Error('Official documentation returned HTTP '+response.status+'.');
 const html=await readTextLimited(response,1_000_000);
 const contentType=(response.headers.get('content-type')||'').toLowerCase();
 if(contentType&&!/(text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType))
  throw new Error('The official documentation URL did not return an HTML or plain-text document.');
 const textContent=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/\s+/g,' ').slice(0,500_000);
 const titleMatch=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
 const title=titleMatch?.[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180)||null;
 const links=new Set<string>();
 const anchor=/<a\b[^>]*href\s*=\s*["']([^"'<>]{1,2048})["'][^>]*>/gi;
 let match:RegExpExecArray|null;
 while((match=anchor.exec(html))!==null&&links.size<500){
  try{
   const candidate=new URL(match[1].replace(/&amp;/g,'&'),docs);
   if(candidate.protocol!=='https:'||candidate.hostname.toLowerCase()!==docs.hostname.toLowerCase()||
    candidate.username||candidate.password||candidate.hash)continue;
   if(!/(openapi|swagger|api[-_]?reference|developer|documentation|\/docs?\/)/i.test(candidate.pathname+' '+candidate.search))continue;
   links.add(candidate.toString());
  }catch{}
 }
 const openApiCandidates=[...links].filter(value=>/(openapi|swagger)/i.test(value)).slice(0,30);
 const protocolTypes:string[]=[];
 const protocolPatterns:[string,RegExp][]=[
  ['REST',/\bREST(?:ful)?\s+API\b|\bHTTP\s+API\b/i],
  ['GraphQL',/\bGraphQL\b/i],['WebSocket',/\bWebSockets?\b|\bwss?:\/\//i],
  ['gRPC',/\bgRPC\b/i],['RPC',/\bJSON[- ]RPC\b|\bXML[- ]RPC\b/i],
  ['webhook',/\bwebhooks?\b/i],['streaming',/\b(server[- ]sent events|SSE|streaming API)\b/i],
 ];
 for(const [name,pattern] of protocolPatterns)if(pattern.test(textContent))protocolTypes.push(name);
 const authTypes:string[]=[];
 const authPatterns:[string,RegExp][]=[
  ['OAuth 2.0',/\bOAuth\s*2(?:\.0)?\b/i],['Bearer token',/\bBearer\s+token\b|\bAuthorization:\s*Bearer\b/i],
  ['API key',/\bAPI[- ]key\b|\bapi_key\b/i],['Basic authentication',/\bHTTP\s+Basic\s+authentication\b/i],
  ['JWT',/\bJWT\b|JSON Web Token/i],['HMAC',/\bHMAC\b/i],
 ];
 for(const [name,pattern] of authPatterns)if(pattern.test(textContent))authTypes.push(name);
 const evidence:string[]=[];
 for(const [name,pattern] of protocolPatterns)if(pattern.test(textContent))evidence.push('protocol:'+name);
 for(const [name,pattern] of authPatterns)if(pattern.test(textContent))evidence.push('auth:'+name);
 if(openApiCandidates.length)evidence.push('same-host OpenAPI/Swagger links found in official documentation HTML');
 if(!textContent.trim())throw new Error('The documentation page contained no readable text; it remains queued for manual review.');
 return {docsUrl:docs.toString(),title,protocolTypes,authTypes,openApiCandidates,evidence};
}
