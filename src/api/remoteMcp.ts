import type {IncomingMessage,ServerResponse} from 'http';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {pool} from './database.ts';
import {authenticateRequest,readJsonBody,sendAuthJson,verifyCsrf} from './auth.ts';

type Json=Record<string,any>;
const VERSION_LEGACY='2025-11-25';
const VERSION_MODERN='2026-07-28';
const blocked=new BlockList();
for(const [address,prefix] of [
 ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
 ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],
 ['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
] as const) blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [
 ['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],
 ['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]
] as const) blocked.addSubnet(address,prefix,'ipv6');
function publicAddress(value:string):boolean{
 const family=isIP(value);if(!family)return false;
 if(family===4)return !blocked.check(value,'ipv4');
 const lower=value.toLowerCase();
 if(lower.startsWith('::ffff:')){const mapped=lower.slice(7);if(isIP(mapped)===4)return !blocked.check(mapped,'ipv4');}
 return !blocked.check(value,'ipv6');
}
function encryptionKey():Buffer{
 const raw=process.env.AFG_INTEGRATION_ENCRYPTION_KEY?.trim()||'';
 if(!raw)throw new Error('MCP credential encryption is not configured on the server.');
 const key=/^[a-f0-9]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
 if(key.length!==32)throw new Error('MCP credential encryption key must be 32 bytes.');
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
 let url:URL;
 try{url=new URL(value);}catch{throw new Error('Enter a valid remote MCP URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
   url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')){
  throw new Error('Remote MCP endpoints must use a public HTTPS URL without embedded credentials, query strings or fragments.');
 }
 const family=isIP(url.hostname);
 if(family){if(!publicAddress(url.hostname))throw new Error('Private or reserved network targets are blocked.');}
 else{
  const records=await lookup(url.hostname,{all:true,verbatim:true});
  if(!records.length||records.some(record=>!publicAddress(record.address)))throw new Error('The MCP hostname resolves to a private or reserved network address.');
 }
 return url;
}
function parseRpcBody(body:string):Json{
 if(body.length>300_000)throw new Error('MCP server response exceeded the 300 KB safety limit.');
 try{return JSON.parse(body) as Json;}catch{}
 for(const line of body.split(/\r?\n/)){
  if(!line.startsWith('data:'))continue;
  const value=line.slice(5).trim();
  if(!value||value==='[DONE]')continue;
  try{return JSON.parse(value) as Json;}catch{}
 }
 throw new Error('MCP server returned an unsupported or invalid response.');
}
type RpcResult={payload:Json|null;sessionId:string|null};
async function rpc(urlText:string,token:string|null,protocol:string,sessionId:string|null,message:Json,notification=false):Promise<RpcResult>{
 const url=await safeEndpoint(urlText);
 const headers=new Headers({
  'Content-Type':'application/json',
  Accept:'application/json, text/event-stream',
  'MCP-Protocol-Version':protocol,
 });
 if(token)headers.set('Authorization','Bearer '+token);
 if(sessionId)headers.set('Mcp-Session-Id',sessionId);
 const response=await fetch(url.toString(),{
  method:'POST',headers,body:JSON.stringify(message),
  signal:AbortSignal.timeout(12_000),redirect:'error',
 });
 const nextSession=response.headers.get('Mcp-Session-Id')||sessionId;
 if(notification&&(response.status===202||response.status===204))return {payload:null,sessionId:nextSession};
 const body=await response.text();
 if(!response.ok)throw new Error('Remote MCP server rejected the request (HTTP '+response.status+').');
 if(!body.trim())return {payload:null,sessionId:nextSession};
 const payload=parseRpcBody(body);
 if(payload.error)throw new Error('Remote MCP protocol error ('+String(payload.error.code??'unknown')+').');
 return {payload,sessionId:nextSession};
}
function requestMessage(id:number|string,method:string,params:Json={},modern=false):Json{
 return modern
  ? {jsonrpc:'2.0',id,method,params,_meta:{protocolVersion:VERSION_MODERN,clientInfo:{name:'AFG AI',version:'1.0.0'},capabilities:{}}}
  : {jsonrpc:'2.0',id,method,params};
}
async function connectAndListTools(url:string,token:string|null):Promise<{protocol:string;sessionId:string|null;serverInfo:Json;tools:Json[]}>{
 try{
  const discovery=await rpc(url,token,VERSION_MODERN,null,requestMessage(1,'server/discover',{},true));
  if(discovery.payload?.result){
   const listed=await rpc(url,token,VERSION_MODERN,null,requestMessage(2,'tools/list',{},true));
   const tools=Array.isArray(listed.payload?.result?.tools)?listed.payload!.result.tools:[];
   return {protocol:VERSION_MODERN,sessionId:null,serverInfo:discovery.payload.result.serverInfo||{},tools:tools.filter(validTool)};
  }
 }catch{/* Try the handshake protocol supported by established remote servers. */}
 const init=await rpc(url,token,VERSION_LEGACY,null,requestMessage(1,'initialize',{
  protocolVersion:VERSION_LEGACY,
  capabilities:{},
  clientInfo:{name:'AFG AI',version:'1.0.0'},
 }));
 const result=init.payload?.result;
 if(!result||typeof result!=='object')throw new Error('Remote MCP server did not complete initialization.');
 const protocol=String(result.protocolVersion||VERSION_LEGACY);
 if(!/^20\d\d-\d\d-\d\d$/.test(protocol))throw new Error('Remote MCP server negotiated an invalid protocol version.');
 await rpc(url,token,protocol,init.sessionId, {jsonrpc:'2.0',method:'notifications/initialized',params:{}},true);
 const listed=await rpc(url,token,protocol,init.sessionId,requestMessage(2,'tools/list',{}));
 const tools=Array.isArray(listed.payload?.result?.tools)?listed.payload!.result.tools:[];
 return {protocol,sessionId:listed.sessionId,serverInfo:result.serverInfo||{},tools:tools.filter(validTool)};
}
function validTool(value:unknown):value is Json{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Json;
 return typeof row.name==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(row.name)&&
  (row.inputSchema===undefined||(row.inputSchema&&typeof row.inputSchema==='object'&&!Array.isArray(row.inputSchema)));
}
async function getOwnerServer(userId:string,id:string){
 const result=await pool!.query(`SELECT id,name,endpoint_url,auth_type,credential_encrypted,enabled,status,
  protocol_version,session_id_encrypted,server_info_json,tools_json,last_checked_at,last_error
  FROM user_mcp_servers WHERE id=$1 AND user_id=$2 LIMIT 1`,[id,userId]);
 return result.rows[0]||null;
}
function publicServer(row:any){
 return {id:row.id,name:row.name,endpointUrl:row.endpoint_url,authType:row.auth_type,
  enabled:row.enabled,status:row.status,protocolVersion:row.protocol_version,
  serverInfo:row.server_info_json||{},tools:Array.isArray(row.tools_json)?row.tools_json:[],
  lastCheckedAt:row.last_checked_at,lastError:row.last_error};
}
async function recordAudit(userId:string,action:string,id:string,metadata:Json={}){
 await pool!.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
  [userId,action,'mcp_server',id,JSON.stringify(metadata)]).catch(()=>{});
}
function modelToolName(serverId:string,toolName:string):string {
 const prefix='mcp_'+serverId.replace(/-/g,'').slice(0,8)+'_';
 const suffix=toolName.toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/^[^a-z]+/,'tool');
 return (prefix+suffix).slice(0,64);
}
export async function getEnabledRemoteMcpToolDefinitions(userId:string){
 if(!pool||!userId)return [];
 try{
  const result=await pool.query(`SELECT id,name,tools_json FROM user_mcp_servers
   WHERE user_id=$1 AND enabled=true AND status='verified' ORDER BY created_at DESC LIMIT 12`,[userId]);
  const definitions:any[]=[];
  for(const row of result.rows){
   const tools=Array.isArray(row.tools_json)?row.tools_json:[];
   for(const tool of tools){
    if(!validTool(tool)||definitions.length>=12)continue;
    definitions.push({type:'function' as const,function:{
     name:modelToolName(String(row.id),tool.name),
     description:(String(tool.description||('Call remote MCP tool '+tool.name))+' (MCP server: '+String(row.name||'Remote server')+')').slice(0,1000),
     parameters:tool.inputSchema&&typeof tool.inputSchema==='object'?tool.inputSchema:{type:'object',properties:{},additionalProperties:true},
    }});
   }
   if(definitions.length>=12)break;
  }
  return definitions;
 }catch(error){
  console.warn('AFG_REMOTE_MCP_TOOL_DISCOVERY_UNAVAILABLE',JSON.stringify({error:error instanceof Error?error.message:'unknown'}));
  return [];
 }
}
export async function executeRemoteMcpTool(userId:string,toolName:string,args:unknown){
 if(!pool||!userId)throw new Error('Sign in to use remote MCP tools.');
 if(!/^mcp_[a-f0-9]{8}_[a-z0-9_]{1,48}$/.test(toolName))throw new Error('Invalid MCP tool name.');
 if(!args||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>48_000)throw new Error('Invalid MCP tool arguments.');
 const prefix=toolName.split('_').slice(1,2)[0];
 const result=await pool.query(`SELECT id,name,endpoint_url,auth_type,credential_encrypted,enabled,status,
  protocol_version,session_id_encrypted,tools_json FROM user_mcp_servers
  WHERE user_id=$1 AND replace(id::text,'-','') LIKE $2 AND enabled=true AND status='verified'`,[userId,prefix+'%']);
 const row=result.rows.find((candidate:any)=>(Array.isArray(candidate.tools_json)?candidate.tools_json:[]).some((tool:any)=>validTool(tool)&&modelToolName(String(candidate.id),tool.name)===toolName));
 if(!row)throw new Error('This MCP tool is no longer enabled for your account.');
 const original=(row.tools_json as Json[]).find((tool:any)=>validTool(tool)&&modelToolName(String(row.id),tool.name)===toolName);
 if(!original)throw new Error('MCP tool is not in the verified tool catalog.');
 const token=row.credential_encrypted?decrypt(row.credential_encrypted):null;
 const session=row.session_id_encrypted?decrypt(row.session_id_encrypted):null;
 const protocol=String(row.protocol_version||VERSION_LEGACY);
 const response=await rpc(row.endpoint_url,token,protocol,session,
  requestMessage(randomUUID(),'tools/call',{name:original.name,arguments:args},protocol===VERSION_MODERN));
 const payload=response.payload?.result;
 if(!payload)throw new Error('MCP tool returned no result.');
 const serialized=JSON.stringify(payload);
 if(serialized.length>16_000)return {truncated:true,responsePreview:serialized.slice(0,16_000),isError:Boolean(payload.isError)};
 await recordAudit(userId,payload.isError?'mcp.tool.call_failed':'mcp.tool.call',String(row.id),{tool:original.name,source:'ai_chat'});
 return payload;
}

export async function handleRemoteMcpApi(req:IncomingMessage,res:ServerResponse,pathname:string):Promise<boolean>{
 if(!pathname.startsWith('/api/mcp/'))return false;
 if(!pool){sendAuthJson(res,503,{error:'Remote MCP connections require PostgreSQL and migration 0013.'});return true;}
 const user=await authenticateRequest(req).catch(()=>null);
 if(!user){sendAuthJson(res,401,{error:'Sign in is required.'});return true;}
 if(req.method!=='GET'&&!verifyCsrf(req)){sendAuthJson(res,403,{error:'CSRF validation failed.'});return true;}
 try{
  if(req.method==='GET'&&pathname==='/api/mcp/directory'){
   const result=await pool.query(`SELECT slug,name,description,auth_type,transports,website_url,install_url,endpoint_url,source_url
    FROM mcp_directory_catalog WHERE is_active=true ORDER BY name`);
   sendAuthJson(res,200,{servers:result.rows});return true;
  }
  if(req.method==='GET'&&pathname==='/api/mcp/servers'){
   const result=await pool.query('SELECT * FROM user_mcp_servers WHERE user_id=$1 ORDER BY created_at DESC',[user.id]);
   sendAuthJson(res,200,{servers:result.rows.map(publicServer),encryptionConfigured:Boolean(process.env.AFG_INTEGRATION_ENCRYPTION_KEY)});return true;
  }
  if(req.method==='POST'&&pathname==='/api/mcp/servers'){
   const body=await readJsonBody(req,6000);
   const name=String(body.name||'').trim(),endpoint=String(body.endpointUrl||'').trim();
   const authType=body.authType==='bearer'?'bearer':'none';
   const token=typeof body.token==='string'?body.token.trim():'';
   if(name.length<2||name.length>100||!endpoint||authType==='bearer'&&!token||authType==='none'&&token){
    sendAuthJson(res,400,{error:'Provide a name, public HTTPS endpoint and a matching authentication mode.'});return true;
   }
   await safeEndpoint(endpoint);
   let secret:string|null=null;
   if(token){try{secret=encrypt(token);}catch(error){sendAuthJson(res,503,{error:error instanceof Error?error.message:'Credential encryption is unavailable.'});return true;}}
   const result=await pool.query(`INSERT INTO user_mcp_servers(user_id,name,endpoint_url,auth_type,credential_encrypted,status,enabled)
    VALUES($1,$2,$3,$4,$5,'unverified',false)
    RETURNING id,name,endpoint_url,auth_type,enabled,status,tools_json,last_checked_at,last_error`,
    [user.id,name,endpoint,authType,secret]);
   await recordAudit(user.id,'mcp.server.create',result.rows[0].id,{authType});
   sendAuthJson(res,201,{server:publicServer({...result.rows[0],protocol_version:null,server_info_json:{}})});return true;
  }
  const testMatch=pathname.match(/^\/api\/mcp\/servers\/([0-9a-f-]{36})\/test$/i);
  if(req.method==='POST'&&testMatch){
   const row=await getOwnerServer(user.id,testMatch[1]);
   if(!row){sendAuthJson(res,404,{error:'MCP server not found.'});return true;}
   const token=row.credential_encrypted?decrypt(row.credential_encrypted):null;
   try{
    const connected=await connectAndListTools(row.endpoint_url,token);
    const tools=connected.tools.slice(0,300);
    await pool.query(`UPDATE user_mcp_servers SET status='verified',enabled=false,protocol_version=$3,
     session_id_encrypted=$4,server_info_json=$5::jsonb,tools_json=$6::jsonb,last_checked_at=now(),last_error=NULL,updated_at=now()
     WHERE id=$1 AND user_id=$2`,[row.id,user.id,connected.protocol,connected.sessionId?encrypt(connected.sessionId):null,
      JSON.stringify(connected.serverInfo),JSON.stringify(tools)]);
    await recordAudit(user.id,'mcp.server.verify',row.id,{protocol:connected.protocol,toolCount:tools.length});
    sendAuthJson(res,200,{verified:true,protocolVersion:connected.protocol,toolCount:tools.length,tools});return true;
   }catch(error){
    const message=error instanceof Error?error.message.slice(0,300):'MCP verification failed.';
    await pool.query(`UPDATE user_mcp_servers SET enabled=false,status='error',last_checked_at=now(),last_error=$3,updated_at=now()
     WHERE id=$1 AND user_id=$2`,[row.id,user.id,message]);
    await recordAudit(user.id,'mcp.server.verify_failed',row.id,{error:message});
    sendAuthJson(res,502,{verified:false,error:message});return true;
   }
  }
  const serverMatch=pathname.match(/^\/api\/mcp\/servers\/([0-9a-f-]{36})$/i);
  if(req.method==='PATCH'&&serverMatch){
   const body=await readJsonBody(req,2000);
   if(typeof body.enabled!=='boolean'){sendAuthJson(res,400,{error:'enabled must be boolean.'});return true;}
   const result=await pool.query(`UPDATE user_mcp_servers SET enabled=$3,
      status=CASE WHEN $3 THEN 'verified' ELSE 'disabled' END,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND ($3=false OR status='verified') RETURNING id,enabled,status`,
      [serverMatch[1],user.id,body.enabled]);
   if(!result.rows[0]){sendAuthJson(res,409,{error:'Only a verified MCP server can be enabled.'});return true;}
   await recordAudit(user.id,'mcp.server.toggle',serverMatch[1],{enabled:body.enabled});
   sendAuthJson(res,200,{server:result.rows[0]});return true;
  }
  if(req.method==='DELETE'&&serverMatch){
   const result=await pool.query('DELETE FROM user_mcp_servers WHERE id=$1 AND user_id=$2 RETURNING id',[serverMatch[1],user.id]);
   if(!result.rows[0]){sendAuthJson(res,404,{error:'MCP server not found.'});return true;}
   await recordAudit(user.id,'mcp.server.delete',serverMatch[1]);
   sendAuthJson(res,200,{deleted:true});return true;
  }
  const callMatch=pathname.match(/^\/api\/mcp\/servers\/([0-9a-f-]{36})\/tools\/call$/i);
  if(req.method==='POST'&&callMatch){
   const body=await readJsonBody(req,60_000);
   const toolName=String(body.name||'');
   const args=body.arguments&&typeof body.arguments==='object'&&!Array.isArray(body.arguments)?body.arguments:{};
   if(!/^[a-zA-Z0-9_.-]{1,128}$/.test(toolName)||JSON.stringify(args).length>48_000){
    sendAuthJson(res,400,{error:'Invalid MCP tool name or arguments.'});return true;
   }
   const row=await getOwnerServer(user.id,callMatch[1]);
   if(!row||!row.enabled||row.status!=='verified'){sendAuthJson(res,409,{error:'MCP server is not enabled and verified.'});return true;}
   const tools=Array.isArray(row.tools_json)?row.tools_json:[];
   if(!tools.some((tool:any)=>tool.name===toolName)){sendAuthJson(res,403,{error:'This tool is not present in the verified tool catalog.'});return true;}
   const token=row.credential_encrypted?decrypt(row.credential_encrypted):null;
   const session=row.session_id_encrypted?decrypt(row.session_id_encrypted):null;
   const protocol=String(row.protocol_version||VERSION_LEGACY);
   try{
    const modern=protocol===VERSION_MODERN;
    const payload=await rpc(row.endpoint_url,token,protocol,session,
      requestMessage(randomUUID(),'tools/call',{name:toolName,arguments:args},modern));
    const result=payload.payload?.result;
    if(!result){sendAuthJson(res,502,{error:'MCP tool returned no result.'});return true;}
    const safe=JSON.stringify(result);
    if(safe.length>100_000){sendAuthJson(res,502,{error:'MCP tool output exceeded the 100 KB safety limit.'});return true;}
    await recordAudit(user.id,'mcp.tool.call',row.id,{tool:toolName,isError:Boolean(result.isError)});
    sendAuthJson(res,result.isError?502:200,{result});return true;
   }catch(error){
    const message=error instanceof Error?error.message.slice(0,300):'MCP tool call failed.';
    await recordAudit(user.id,'mcp.tool.call_failed',row.id,{tool:toolName,error:message});
    sendAuthJson(res,502,{error:message});return true;
   }
  }
  sendAuthJson(res,404,{error:'Remote MCP route not found.'});return true;
 }catch(error){
  const message=error instanceof Error?error.message.slice(0,300):'Remote MCP request failed.';
  sendAuthJson(res,500,{error:message});return true;
 }
}
