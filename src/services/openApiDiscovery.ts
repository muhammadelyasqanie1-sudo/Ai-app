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
 const source=value||method+'_'+path.replace(/[{}]/g,'');
 const name=source.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);
 return /^[a-z]/.test(name)?name:'api_'+name;
}
function authSummary(document:Json,operation:Json):string[]{
 const requirements=operation.security??document.security??[];
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
export async function discoverOpenApiOperations(specUrl:string){
 const url=await safeSpecUrl(specUrl);
 const response=await fetch(url.toString(),{headers:{Accept:'application/vnd.oai.openapi+json, application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
 if(!response.ok)throw new Error('OpenAPI document returned HTTP '+response.status+'.');
 const raw=await response.text();if(raw.length>2_000_000)throw new Error('OpenAPI document exceeds the 2 MB safety limit.');
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
    method:method.toUpperCase(),endpointUrl:endpoint,inputSchema:built.schema,
    authOptions:auth,unsupportedParameters:built.unsupported,
    usable:built.unsupported.length===0&&auth.every(item=>['none','bearer'].includes(item)||item.startsWith('header_key:')||item.startsWith('query_key:')),
   });
   if(operations.length>=100)break;
  }
  if(operations.length>=100)break;
 }
 return {specTitle:String(document.info?.title||'OpenAPI service').slice(0,160),specVersion:String(document.info?.version||'').slice(0,40),specUrl:url.toString(),operationCount:operations.length,operations};
}
