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
function validateSchema(schema:unknown):Json{
 if(!schema||typeof schema!=='object'||Array.isArray(schema))throw new Error('Input schema must be a JSON object.');
 const value=schema as Json;
 if(value.type!=='object'||!value.properties||typeof value.properties!=='object'||Array.isArray(value.properties))throw new Error('Input schema must use type object and a properties map.');
 if(Object.keys(value.properties).length>40)throw new Error('An API tool may define at most 40 input parameters.');
 const required=Array.isArray(value.required)?value.required:[];
 if(required.length>40||required.some((item:any)=>typeof item!=='string'||!Object.prototype.hasOwnProperty.call(value.properties,item)))throw new Error('Input schema required fields are invalid.');
 for(const [key,prop] of Object.entries(value.properties)){
  if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)||['__proto__','prototype','constructor'].includes(key)||!prop||typeof prop!=='object'||Array.isArray(prop))throw new Error('Input schema contains an invalid property.');
  const p=prop as Json;
  if(!['string','number','integer','boolean'].includes(p.type))throw new Error('API connector parameters must be string, number, integer or boolean.');
  if(p['x-in']!==undefined&&!['path','query','body'].includes(p['x-in']))throw new Error('Parameter x-in must be path, query or body.');
  if(p.enum!==undefined&&(!Array.isArray(p.enum)||p.enum.length>100))throw new Error('Parameter enum is invalid.');
  if(p.maxLength!==undefined&&(!Number.isInteger(p.maxLength)||p.maxLength<0||p.maxLength>10000))throw new Error('Parameter maxLength is invalid.');
 }
 return {type:'object',properties:value.properties,required,additionalProperties:false};
}
function modelToolSchema(input:unknown):Json{
 const schema=validateSchema(input);
 const properties:Json={};
 for(const [name,value] of Object.entries(schema.properties as Json)){
  const source=value as Json;
  const property:Json={type:source.type};
  if(typeof source.description==='string')property.description=source.description.slice(0,500);
  if(Array.isArray(source.enum))property.enum=source.enum.slice(0,100);
  if(Number.isInteger(source.maxLength))property.maxLength=source.maxLength;
  properties[name]=property;
 }
 return {type:'object',properties,required:schema.required,additionalProperties:false};
}

function validateArgs(schema:Json,args:unknown):Json{
 if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Tool arguments must be a JSON object.');
 const object=args as Json;
 if(JSON.stringify(object).length>48_000)throw new Error('Tool arguments exceed the 48 KB limit.');
 const props=schema.properties as Json,required=schema.required as string[];
 for(const key of required)if(!Object.prototype.hasOwnProperty.call(object,key))throw new Error('Missing required parameter: '+key);
 for(const [key,value] of Object.entries(object)){
  const p=props[key] as Json|undefined;if(!p)throw new Error('Unknown parameter: '+key);
  if(p.type==='string'&&typeof value!=='string')throw new Error('Parameter '+key+' must be a string.');
  if(p.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))throw new Error('Parameter '+key+' must be a number.');
  if(p.type==='integer'&&(!Number.isSafeInteger(value)))throw new Error('Parameter '+key+' must be an integer.');
  if(p.type==='boolean'&&typeof value!=='boolean')throw new Error('Parameter '+key+' must be a boolean.');
  if(p.maxLength!==undefined&&typeof value==='string'&&value.length>p.maxLength)throw new Error('Parameter '+key+' is too long.');
  if(Array.isArray(p.enum)&&!p.enum.some((allowed:any)=>allowed===value))throw new Error('Parameter '+key+' is not an allowed value.');
 }
 return object;
}
function publicRow(row:any){
 return {id:row.id,catalogSourceKey:row.catalog_source_key,name:row.name,toolName:row.tool_name,description:row.description,
  endpointUrl:row.endpoint_url,httpMethod:row.http_method,authType:row.auth_type,authHeaderName:row.auth_header_name,
  hasCredential:Boolean(row.credential_encrypted),inputSchema:row.input_schema_json,sampleArguments:row.sample_arguments_json,
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
 for(const [key,value] of Object.entries(values)){
  const property=(schema.properties as Json)[key] as Json;
  const location=property['x-in']||(row.http_method==='GET'||row.http_method==='DELETE'?'query':'body');
  if(location==='path'){
   const marker='{'+key+'}';
   if(!pathname.includes(marker))throw new Error('Path template is missing {'+key+'}.');
   pathname=pathname.split(marker).join(encodeURIComponent(String(value)));
  }else if(location==='query')query.set(key,String(value));
  else body[key]=value;
 }
 if(/\{[a-zA-Z][a-zA-Z0-9_]*\}/.test(pathname))throw new Error('The API endpoint contains an unresolved path parameter.');
 const url=new URL(base.toString());url.pathname=pathname;
 if(query.size)url.search=query.toString();
 const headers=new Headers({Accept:'application/json'});
 const secrets:string[]=[];
 if(row.auth_type==='bearer'||row.auth_type==='header_key'){
  if(!row.credential_encrypted)throw new Error('API connector credential is missing.');
  const secret=decrypt(row.credential_encrypted);secrets.push(secret);
  const key=row.auth_type==='bearer'?'Authorization':String(row.auth_header_name||'X-API-Key');
  headers.set(key,row.auth_type==='bearer'?'Bearer '+secret:secret);
 }
 const init:RequestInit={method:row.http_method,headers,redirect:'error',signal:AbortSignal.timeout(timeoutMs)};
 if(['POST','PUT','PATCH'].includes(row.http_method)){headers.set('Content-Type','application/json');init.body=JSON.stringify(body);}
 const started=Date.now();
 let response:Response;
 try{response=await fetch(url.toString(),init);}catch(error){
  if(error instanceof Error&&error.name==='TimeoutError')throw new Error('The API endpoint timed out.');
  throw new Error('The API endpoint could not be reached.');
 }
 const raw=await response.text();
 const durationMs=Date.now()-started;
 if(raw.length>1_000_000)throw new Error('API response exceeded the 1 MB safety limit.');
 const safeRaw=secrets.reduce((value,secret)=>value.split(secret).join('[redacted]'),raw);
 let data:unknown=safeRaw;
 if(safeRaw){try{data=JSON.parse(safeRaw);}catch{}}
 if(!response.ok)throw Object.assign(new Error('The external API returned HTTP '+response.status+'.'),{httpStatus:response.status,durationMs});
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

export async function getEnabledUserApiToolDefinitions(userId:string){
 if(!pool||!userId)return [];
 try{
  const result=await pool.query(`SELECT tool_name,description,input_schema_json FROM user_api_connectors
   WHERE user_id=$1 AND enabled=true AND status='verified' ORDER BY created_at DESC LIMIT 12`,[userId]);
  return result.rows.map(row=>({
   type:'function' as const,
   function:{
    name:String(row.tool_name),
    description:String(row.description||'Call the configured API connector '+row.tool_name).slice(0,1000),
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
 const found=await pool.query(`SELECT * FROM user_api_connectors WHERE user_id=$1 AND tool_name=$2
  AND enabled=true AND status='verified' LIMIT 1`,[userId,toolName]);
 const row=found.rows[0];
 if(!row)throw new Error('This API connector is no longer enabled for your account.');
 if(!await reserveConnectorCall(userId,row.id))throw new Error('This API connector has reached its limit of 30 calls per minute.');
 const requestId=randomUUID();
 try{
  const result=await execute(row,args,userId,requestId,10_000);
  const serialized=JSON.stringify(result.data);
  if(serialized.length>16_000)return {status:result.status,durationMs:result.durationMs,truncated:true,responsePreview:serialized.slice(0,16_000)};
  return result;
 }catch(error){
  const message=error instanceof Error?error.message.slice(0,250):'API connector call failed.';
  await pool.query(`INSERT INTO user_api_connector_runs(connector_id,user_id,request_id,http_method,duration_ms,outcome,error_code)
   VALUES($1,$2,$3,$4,0,'error',$5)`,[row.id,userId,requestId,row.http_method,message]).catch(()=>{});
  throw error;
 }
}

async function audit(userId:string,action:string,id:string,metadata:Json={}){
 await pool!.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
  [userId,action,'api_connector',id,JSON.stringify(metadata)]).catch(()=>{});
}
export async function handleUserApiConnectorApi(req:IncomingMessage,res:ServerResponse,pathname:string):Promise<boolean>{
 if(!pathname.startsWith('/api/api-hub/connectors'))return false;
 if(!pool){sendAuthJson(res,503,{error:'API connectors require PostgreSQL and migration 0014.'});return true;}
 const user=await authenticateRequest(req).catch(()=>null);
 if(!user){sendAuthJson(res,401,{error:'Sign in is required.'});return true;}
 if(req.method!=='GET'&&!verifyCsrf(req)){sendAuthJson(res,403,{error:'CSRF validation failed.'});return true;}
 try{
  if(req.method==='GET'&&pathname==='/api/api-hub/connectors'){
   const result=await pool.query('SELECT * FROM user_api_connectors WHERE user_id=$1 ORDER BY created_at DESC',[user.id]);
   sendAuthJson(res,200,{connectors:result.rows.map(publicRow),encryptionConfigured:Boolean(process.env.AFG_INTEGRATION_ENCRYPTION_KEY)});return true;
  }
  if(req.method==='POST'&&pathname==='/api/api-hub/connectors'){
   const body=await readJsonBody(req,60_000);
   const name=String(body.name||'').trim(),toolName=String(body.toolName||'').trim().toLowerCase();
   const description=String(body.description||'').trim(),endpoint=String(body.endpointUrl||'').trim();
   const method=String(body.method||'GET').toUpperCase(),authType=String(body.authType||'none');
   const authHeader=String(body.authHeaderName||'X-API-Key');
   const secret=typeof body.credential==='string'?body.credential.trim():'';
   if(name.length<2||name.length>120||!/^[a-z][a-z0-9_]{1,63}$/.test(toolName)||description.length>2000||
    !['GET','POST','PUT','PATCH','DELETE'].includes(method)||!['none','bearer','header_key'].includes(authType)||
    (authType==='none'&&secret)||(authType!=='none'&&!secret)||
    (authType==='header_key'&&!/^[A-Za-z0-9-]{1,64}$/.test(authHeader))){
    sendAuthJson(res,400,{error:'Invalid API connector settings.'});return true;
   }
   await safeEndpoint(endpoint);
   const schema=validateSchema(body.inputSchema||{type:'object',properties:{},required:[],additionalProperties:false});
   const sample=validateArgs(schema,body.sampleArguments||{});
   const sourceKey=typeof body.catalogSourceKey==='string'?body.catalogSourceKey:null;
   if(sourceKey){const exists=await pool.query('SELECT 1 FROM public_api_catalog WHERE source_key=$1',[sourceKey]);if(!exists.rows[0]){sendAuthJson(res,404,{error:'Public API catalog entry was not found.'});return true;}}
   const encrypted=secret?encrypt(secret):null;
   const created=await pool.query(`INSERT INTO user_api_connectors(user_id,catalog_source_key,name,tool_name,description,endpoint_url,http_method,auth_type,auth_header_name,credential_encrypted,input_schema_json,sample_arguments_json)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb) RETURNING *`,
    [user.id,sourceKey,name,toolName,description,endpoint,method,authType,authHeader,encrypted,JSON.stringify(schema),JSON.stringify(sample)]);
   await audit(user.id,'api.connector.create',created.rows[0].id,{toolName,method,authType});
   sendAuthJson(res,201,{connector:publicRow(created.rows[0])});return true;
  }
  const testMatch=pathname.match(/^\/api\/api-hub\/connectors\/([0-9a-f-]{36})\/test$/i);
  if(req.method==='POST'&&testMatch){
   const row=await ownerConnector(user.id,testMatch[1]);if(!row){sendAuthJson(res,404,{error:'API connector not found.'});return true;}
   const requestId=randomUUID();
   try{
    const result=await execute(row,row.sample_arguments_json,user.id,requestId);
    await pool.query(`UPDATE user_api_connectors SET status='verified',enabled=false,last_tested_at=now(),last_http_status=$3,last_error=NULL,updated_at=now() WHERE id=$1 AND user_id=$2`,
     [row.id,user.id,result.status]);
    await audit(user.id,'api.connector.verify',row.id,{status:result.status,durationMs:result.durationMs});
    sendAuthJson(res,200,{verified:true,httpStatus:result.status,durationMs:result.durationMs});return true;
   }catch(error){
    const status=Number((error as any)?.httpStatus)||null;
    const message=error instanceof Error?error.message.slice(0,250):'API connector verification failed.';
    await pool.query(`UPDATE user_api_connectors SET enabled=false,status='error',last_tested_at=now(),last_http_status=$3,last_error=$4,updated_at=now() WHERE id=$1 AND user_id=$2`,
     [row.id,user.id,status,message]);
    await audit(user.id,'api.connector.verify_failed',row.id,{status,error:message});
    sendAuthJson(res,502,{verified:false,error:message});return true;
   }
  }
  const itemMatch=pathname.match(/^\/api\/api-hub\/connectors\/([0-9a-f-]{36})$/i);
  if(itemMatch&&req.method==='PATCH'){
   const body=await readJsonBody(req,2000);
   if(typeof body.enabled!=='boolean'){sendAuthJson(res,400,{error:'enabled must be boolean.'});return true;}
   const updated=await pool.query(`UPDATE user_api_connectors SET enabled=$3,status=CASE WHEN $3 THEN 'verified' ELSE 'disabled' END,updated_at=now()
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
   const row=await ownerConnector(user.id,callMatch[1]);
   if(!row||!row.enabled||row.status!=='verified'){sendAuthJson(res,409,{error:'API connector is not verified and enabled.'});return true;}
   if(!await reserveConnectorCall(user.id,row.id)){sendAuthJson(res,429,{error:'API connector limit is 30 calls per minute.'});return true;}
   const requestId=randomUUID(),body=await readJsonBody(req,60_000);
   try{
    const result=await execute(row,body.arguments||{},user.id,requestId);
    sendAuthJson(res,200,{requestId,result});return true;
   }catch(error){
    const message=error instanceof Error?error.message.slice(0,250):'API connector call failed.';
    await pool.query(`INSERT INTO user_api_connector_runs(connector_id,user_id,request_id,http_method,duration_ms,outcome,error_code)
      VALUES($1,$2,$3,$4,0,'error',$5)`,[row.id,user.id,requestId,row.http_method,message]).catch(()=>{});
    sendAuthJson(res,502,{requestId,error:message});return true;
   }
  }
  sendAuthJson(res,404,{error:'API connector route not found.'});return true;
 }catch(error){
  const message=error instanceof Error?error.message.slice(0,300):'API connector operation failed.';
  sendAuthJson(res,400,{error:message});return true;
 }
}
