import type { IncomingMessage, ServerResponse } from 'http';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { connect as connectSocket, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';

type Json = Record<string, any>;
const KEY_BYTES = 32;
function encryptionKey(): Buffer {
  const raw = process.env.AFG_INTEGRATION_ENCRYPTION_KEY?.trim() || '';
  if (!raw) throw new Error('AFG_INTEGRATION_ENCRYPTION_KEY is not configured on the server.');
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) throw new Error('AFG_INTEGRATION_ENCRYPTION_KEY must be 32 bytes (base64 or 64-character hex).');
  return key;
}
function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
function decryptSecret(value: string): string {
  const [version,iv,tag,data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Stored credential format is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
}
function redact(message: string, secrets: string[]): string {
  let safe = message.slice(0,500);
  for (const secret of secrets.filter(Boolean)) safe = safe.split(secret).join('[REDACTED]');
  return safe.replace(/(Bearer\s+)[^\s,;]+/gi,'$1[REDACTED]').replace(/([?&](?:api_key|token|key)=)[^&\s]+/gi,'$1[REDACTED]');
}
async function jsonFetch(url: string, init: RequestInit, secrets: string[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url,{...init,signal:controller.signal});
    const body = await response.text();
    if (!response.ok) throw new Error(redact(body || `Provider returned HTTP ${response.status}`,secrets));
    try { return JSON.parse(body); } catch { throw new Error('Provider returned an invalid response.'); }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Connection timed out.');
    throw error;
  } finally { clearTimeout(timer); }
}
async function tcpProbe(host: string, port: number): Promise<void> {
  const addresses = await lookup(host,{all:true,verbatim:true});
  if (!addresses.length) throw new Error('Host did not resolve.');
  const isPrivate = (address:string) => {
    if (address.includes(':')) {
      const value=address.toLowerCase();
      return value==='::1'||value==='::'||value.startsWith('fc')||value.startsWith('fd')||value.startsWith('fe80:')||value.startsWith('::ffff:127.')||value.startsWith('::ffff:10.');
    }
    const parts=address.split('.').map(Number);
    return parts.length!==4||parts[0]===0||parts[0]===10||parts[0]===127||parts[0]>=224||
      (parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168);
  };
  if (addresses.some(item=>isPrivate(item.address))) throw new Error('Private, loopback and link-local FTP/SFTP targets are blocked.');
  const target=addresses[0].address;
  if (!isIP(target)) throw new Error('Resolved host address is invalid.');
  await new Promise<void>((resolve,reject) => {
    const socket = connectSocket({host:target,port});
    const timer = setTimeout(() => socket.destroy(new Error('Connection timed out.')),7000);
    socket.once('connect',()=>{clearTimeout(timer);socket.end();resolve();});
    socket.once('error',(error)=>{clearTimeout(timer);reject(new Error(redact(error.message,[])));});
  });
}
async function requireAdmin(req: IncomingMessage, res: ServerResponse) {
  let user;
  try { user = await authenticateRequest(req); } catch {
    sendAuthJson(res,503,{error:'Could not verify administrator session.'}); return null;
  }
  if (!user) { sendAuthJson(res,401,{error:'Sign in is required.'}); return null; }
  if (user.role !== 'admin') { sendAuthJson(res,403,{error:'Administrator access is required.'}); return null; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { sendAuthJson(res,403,{error:'CSRF validation failed.'}); return null; }
  return user;
}
async function getCredentials(integrationId: string) {
  const result = await pool!.query('SELECT credential_key,credential_value_encrypted FROM integration_credentials WHERE integration_id=$1',[integrationId]);
  return Object.fromEntries(result.rows.map((row:any)=>[row.credential_key,decryptSecret(row.credential_value_encrypted)])) as Record<string,string>;
}
export async function getIntegrationRuntime(slug: string): Promise<{config: Json; credentials: Record<string,string>} | null> {
  if (!pool) return null;
  const row = await pool.query('SELECT id,config_json FROM integrations WHERE slug=$1 AND enabled=true AND status=\'active\' AND last_check_ok=true',[slug]);
  if (!row.rows[0]) return null;
  return {config:row.rows[0].config_json||{},credentials:await getCredentials(row.rows[0].id)};
}
async function testIntegration(slug: string, credentials: Record<string,string>, config: Json) {
  const secrets = Object.values(credentials);
  if (slug === 'github') {
    if (!credentials.token) throw new Error('Add a GitHub personal access token first.');
    const user = await jsonFetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+credentials.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}},secrets);
    const repos = await jsonFetch('https://api.github.com/user/repos?per_page=1&visibility=all',{headers:{Authorization:'Bearer '+credentials.token,Accept:'application/vnd.github+json'}},secrets);
    return {message:'GitHub API verified.',username:user.login,repoCount:Number(user.total_private_repos||0)+Number(user.public_repos||0),sampledRepos:Array.isArray(repos)?repos.length:0};
  }
  if (slug === 'telegram') {
    if (!credentials.bot_token) throw new Error('Add the Telegram Bot Token first.');
    const result = await jsonFetch('https://api.telegram.org/bot'+encodeURIComponent(credentials.bot_token)+'/getMe',{method:'GET'},secrets);
    if (!result.ok || !result.result?.id) throw new Error('Telegram getMe did not verify the bot.');
    return {message:'Telegram bot verified.',username:result.result.username||null,webhookConfigured:Boolean(config.webhook_url)};
  }
  if (slug === 'web-search') {
    const provider = String(config.provider||'tavily');
    const key = credentials.api_key;
    if (!key) throw new Error('Add the search provider API key first.');
    if (provider === 'tavily') {
      const result = await jsonFetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,query:'test',max_results:1})},secrets);
      return {message:'Tavily search verified.',results:Number(result.results?.length||0)};
    }
    if (provider === 'brave') {
      const result = await jsonFetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1',{headers:{'X-Subscription-Token':key,Accept:'application/json'}},secrets);
      return {message:'Brave Search verified.',results:Number(result.web?.results?.length||0)};
    }
    if (provider === 'serpapi') {
      const result = await jsonFetch('https://serpapi.com/search.json?engine=google&q=test&api_key='+encodeURIComponent(key),{method:'GET'},secrets);
      return {message:'SerpAPI verified.',results:Number(result.organic_results?.length||0)};
    }
    throw new Error('Unsupported search provider. Choose Tavily, Brave, or SerpAPI.');
  }
  if (slug === 'ftp-sftp') {
    const host = String(config.host||'');
    const port = Number(config.port|| (config.protocol==='ftp'?21:22));
    if (!host || !Number.isInteger(port) || port<1 || port>65535) throw new Error('Provide a valid host and port.');
    await tcpProbe(host,port);
    throw new Error('TCP endpoint is reachable, but protocol authentication and directory listing are not implemented. This connection remains inactive until an FTP/SFTP adapter is installed.');
  }
  if (slug === 'mcp') throw new Error('MCP remains disabled: no isolated sandbox runtime is configured. A process is never started on the application host.');
  if (slug === 'ftp-server') throw new Error('FTP Server is unavailable until a dedicated isolated transfer service is provisioned.');
  throw new Error('Unknown integration.');
}
export async function handleConnectionsApi(req: IncomingMessage,res: ServerResponse,pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/admin/connections')) return false;
  if (!pool) { sendAuthJson(res,503,{error:'Connections require DATABASE_URL and the database schema.'}); return true; }
  if (!['GET','POST','PATCH','DELETE'].includes(req.method||'')) { sendAuthJson(res,405,{error:'Method not allowed.'}); return true; }
  const admin = await requireAdmin(req,res); if (!admin) return true;
  try {
    if (req.method==='GET' && pathname==='/api/admin/connections') {
      const result = await pool.query(`SELECT i.id,i.slug,i.display_name,i.icon_name,i.category,i.enabled,i.config_json,i.status,
        i.last_checked_at,i.last_check_ok,i.last_error,
        (SELECT count(DISTINCT l.user_id)::int FROM integration_user_links l WHERE l.integration_id=i.id AND l.revoked_at IS NULL) AS linked_users,
        EXISTS(SELECT 1 FROM integration_credentials c WHERE c.integration_id=i.id) AS has_credentials
        FROM integrations i ORDER BY i.category,i.display_name`);
      const servers = await pool.query('SELECT id,name,command,args_json,status,last_ping_at,last_error,created_at FROM mcp_servers ORDER BY created_at DESC');
      sendAuthJson(res,200,{integrations:result.rows.map((row:any)=>({...row,config_json:row.config_json||{},last_error:row.last_error?redact(row.last_error,[]):null})),mcpServers:servers.rows, encryptionConfigured:Boolean(process.env.AFG_INTEGRATION_ENCRYPTION_KEY)}); return true;
    }
    if (req.method==='POST' && pathname==='/api/admin/connections/credentials') {
      const body = await readJsonBody(req,12000);
      const slug = String(body.slug||'');
      const credentials = body.credentials;
      if (!/^[a-z0-9-]{2,64}$/.test(slug)||!credentials||typeof credentials!=='object'||Array.isArray(credentials)) { sendAuthJson(res,400,{error:'Invalid integration credentials payload.'}); return true; }
      const integration = await pool.query('SELECT id FROM integrations WHERE slug=$1',[slug]);
      if (!integration.rows[0]) { sendAuthJson(res,404,{error:'Integration not found.'}); return true; }
      const entries = Object.entries(credentials).filter(([key,value])=>/^[a-z0-9_]{1,64}$/.test(key)&&typeof value==='string'&&value.trim()).slice(0,12) as [string,string][];
      if (!entries.length) { sendAuthJson(res,400,{error:'Provide at least one non-empty credential.'}); return true; }
      const client=await pool.connect();
      try { await client.query('BEGIN');
        for(const [key,value] of entries) await client.query(`INSERT INTO integration_credentials(integration_id,credential_key,credential_value_encrypted)
          VALUES($1,$2,$3) ON CONFLICT(integration_id,credential_key) DO UPDATE SET credential_value_encrypted=EXCLUDED.credential_value_encrypted,updated_at=now()`,
          [integration.rows[0].id,key,encryptSecret(value)]);
        if (body.config && typeof body.config==='object'&&!Array.isArray(body.config)) await client.query(`UPDATE integrations SET config_json=config_json||$2::jsonb,enabled=false,status=CASE WHEN status='active' THEN 'error' ELSE 'unconfigured' END,last_check_ok=NULL,last_error=NULL,updated_at=now() WHERE id=$1`,[integration.rows[0].id,JSON.stringify(body.config)]);
        else await client.query(`UPDATE integrations SET enabled=false,status=CASE WHEN status='active' THEN 'error' ELSE 'unconfigured' END,last_check_ok=NULL,last_error=NULL,updated_at=now() WHERE id=$1`,[integration.rows[0].id]);
        if(slug==='ftp-sftp'&&body.config&&typeof body.config.host==='string'&&typeof body.config.username==='string') {
          await client.query(`INSERT INTO ftp_workspaces(user_id,integration_id,host,port,protocol,remote_path,local_path_alias)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[admin.id,integration.rows[0].id,body.config.host,Number(body.config.port||22),body.config.protocol==='ftp'?'ftp':'sftp',String(body.config.remote_path||'/').slice(0,500),String(body.config.local_path_alias||'workspace').slice(0,100)]);
        }
        await client.query('COMMIT');
      } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[admin.id,'integration.credentials.save','integration',slug,JSON.stringify({credentialKeys:entries.map(([key])=>key)})]);
      sendAuthJson(res,200,{saved:true,masked:'••••••••',requiresHealthCheck:true}); return true;
    }
    if (req.method==='POST' && pathname==='/api/admin/connections/config') {
      const body=await readJsonBody(req,8000); const slug=String(body.slug||'');
      if(!/^[a-z0-9-]{2,64}$/.test(slug)||!body.config||typeof body.config!=='object'||Array.isArray(body.config)){sendAuthJson(res,400,{error:'Invalid connection settings.'});return true;}
      await pool.query(`UPDATE integrations SET config_json=config_json||$2::jsonb,enabled=false,status=CASE WHEN status='active' THEN 'error' ELSE status END,last_check_ok=NULL,updated_at=now() WHERE slug=$1`,[slug,JSON.stringify(body.config)]);
      sendAuthJson(res,200,{saved:true,requiresHealthCheck:true});return true;
    }
    if (req.method==='POST' && pathname==='/api/admin/connections/test') {
      const body=await readJsonBody(req,4000); const slug=String(body.slug||'');
      const row=await pool.query('SELECT id,config_json FROM integrations WHERE slug=$1',[slug]);
      if(!row.rows[0]){sendAuthJson(res,404,{error:'Integration not found.'});return true;}
      const credentials=await getCredentials(row.rows[0].id);
      try {
        const result=await testIntegration(slug,credentials,row.rows[0].config_json||{});
        await pool.query(`UPDATE integrations SET status='active',enabled=true,last_checked_at=now(),last_check_ok=true,last_error=NULL,updated_at=now() WHERE id=$1`,[row.rows[0].id]);
        await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[admin.id,'integration.health.success','integration',slug,JSON.stringify({username:result.username||null})]);
        sendAuthJson(res,200,{ok:true,result});return true;
      } catch(error) {
        const message=redact(error instanceof Error?error.message:'Connection test failed.',Object.values(credentials));
        await pool.query(`UPDATE integrations SET status='error',enabled=false,last_checked_at=now(),last_check_ok=false,last_error=$2,updated_at=now() WHERE id=$1`,[row.rows[0].id,message]);
        await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[admin.id,'integration.health.failed','integration',slug,JSON.stringify({error:message})]);
        sendAuthJson(res,502,{ok:false,error:message});return true;
      }
    }
    if (req.method==='PATCH' && pathname==='/api/admin/connections/toggle') {
      const body=await readJsonBody(req,3000);const slug=String(body.slug||'');
      if(typeof body.enabled!=='boolean'){sendAuthJson(res,400,{error:'enabled must be boolean.'});return true;}
      const result=await pool.query(`UPDATE integrations SET enabled=$2,
        status=CASE WHEN $2 THEN 'active' ELSE 'disabled' END,updated_at=now()
        WHERE slug=$1 AND ($2=false OR (status IN ('active','disabled') AND last_check_ok=true AND last_checked_at IS NOT NULL))
        RETURNING slug,enabled,status`,[slug,body.enabled]);
      if(!result.rows[0]){sendAuthJson(res,409,{error:'Connection cannot be enabled before a successful health check.'});return true;}
      sendAuthJson(res,200,{integration:result.rows[0]});return true;
    }
    if (req.method==='DELETE' && pathname==='/api/admin/connections/credentials') {
      const body=await readJsonBody(req,3000);const slug=String(body.slug||'');
      const result=await pool.query(`UPDATE integrations SET enabled=false,status='error',last_check_ok=false,last_error='Credentials revoked by administrator.',updated_at=now() WHERE slug=$1 RETURNING id`,[slug]);
      if(!result.rows[0]){sendAuthJson(res,404,{error:'Integration not found.'});return true;}
      await pool.query('DELETE FROM integration_credentials WHERE integration_id=$1',[result.rows[0].id]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[admin.id,'integration.credentials.revoke','integration',slug,'{}']);
      sendAuthJson(res,200,{revoked:true,enabled:false});return true;
    }
    if (req.method==='POST' && pathname==='/api/admin/connections/mcp') {
      const body=await readJsonBody(req,8000);
      const name=String(body.name||'').trim(),command=String(body.command||'').trim();
      const args=body.args??[],env=body.env??{};
      if(!name||name.length>100||!command||command.length>300||!Array.isArray(args)||args.length>32||args.some((x:any)=>typeof x!=='string'||x.length>500)||!env||typeof env!=='object'||Array.isArray(env)){sendAuthJson(res,400,{error:'Invalid MCP server configuration.'});return true;}
      const envEntries=Object.entries(env).filter(([key,value])=>/^[A-Z_][A-Z0-9_]{0,63}$/.test(key)&&typeof value==='string'&&value.length<=4000) as [string,string][];
      if(Object.keys(env).length!==envEntries.length){sendAuthJson(res,400,{error:'MCP environment variables must use valid uppercase names and string values (max 4 KB each).'});return true;}
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const created=await client.query(`INSERT INTO mcp_servers(name,command,args_json,env_json,status,last_error)
          VALUES($1,$2,$3::jsonb,'{}'::jsonb,'stopped','Sandbox runtime not configured; process not started.')
          RETURNING id,name,command,args_json,status,last_ping_at,last_error,created_at`,[name,command,JSON.stringify(args)]);
        for(const [key,value] of envEntries) await client.query(`INSERT INTO mcp_server_credentials(server_id,credential_key,credential_value_encrypted)
          VALUES($1,$2,$3)`,[created.rows[0].id,key,encryptSecret(value)]);
        await client.query('COMMIT');
        sendAuthJson(res,201,{server:created.rows[0],encryptedEnvironmentVariables:envEntries.length,warning:'Saved securely. Start remains blocked until an isolated sandbox runtime is provisioned.'});return true;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    if (req.method==='PATCH' && pathname==='/api/admin/connections/mcp') {
      const body=await readJsonBody(req,3000);const id=String(body.id||'');
      if(body.action==='stop'){const result=await pool.query(`UPDATE mcp_servers SET status='stopped',updated_at=now() WHERE id=$1 RETURNING id,status`,[id]);sendAuthJson(res,result.rows.length?200:404,{server:result.rows[0]||null});return true;}
      if(body.action==='start'){await pool.query(`UPDATE mcp_servers SET status='error',last_error='Sandbox runtime not configured; process was not started.',updated_at=now() WHERE id=$1`,[id]);sendAuthJson(res,503,{error:'MCP cannot start until an isolated sandbox runtime is provisioned.'});return true;}
      sendAuthJson(res,400,{error:'Unsupported MCP action.'});return true;
    }
    sendAuthJson(res,404,{error:'Connections route not found.'});return true;
  } catch(error) {
    const message=error instanceof Error?redact(error.message,[]):'Connections operation failed.';
    sendAuthJson(res,500,{error:message});return true;
  }
}

const githubOAuthStates = new Map<string,{userId:string;expiresAt:number}>();
export async function handleUserIntegrationApi(req: IncomingMessage,res: ServerResponse,pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/integrations/github/')) return false;
  if (!pool) { sendAuthJson(res,503,{error:'Account integrations require the database.'}); return true; }
  if (pathname==='/api/integrations/github/callback' && req.method==='GET') {
    const url=new URL(req.url||'/', 'http://localhost');
    const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
    const saved=githubOAuthStates.get(state);githubOAuthStates.delete(state);
    if(!saved||saved.expiresAt<Date.now()||!code){res.statusCode=302;res.setHeader('Location',(process.env.APP_ORIGIN||'/').split(',')[0].replace(/\/$/,'')+'/?github=oauth_failed');res.end();return true;}
    try {
      const origin=(process.env.APP_ORIGIN||'').split(',')[0].trim().replace(/\/$/,'');
      const clientId=process.env.GITHUB_OAUTH_CLIENT_ID||'',clientSecret=process.env.GITHUB_OAUTH_CLIENT_SECRET||'';
      if(!origin.startsWith('https://')||!clientId||!clientSecret) throw new Error('GitHub OAuth is not configured.');
      const tokenResponse=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,state})});
      const tokenData=await tokenResponse.json() as any;
      if(!tokenResponse.ok||!tokenData.access_token) throw new Error('GitHub OAuth token exchange failed.');
      const token=String(tokenData.access_token);
      const profile=await jsonFetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}},[token]);
      const integration=await pool.query("SELECT id FROM integrations WHERE slug='github' LIMIT 1");
      if(!integration.rows[0]) throw new Error('GitHub integration is not initialized.');
      await pool.query(`INSERT INTO integration_user_credentials(integration_id,user_id,credential_key,credential_value_encrypted)
        VALUES($1,$2,'oauth_token',$3) ON CONFLICT(integration_id,user_id,credential_key)
        DO UPDATE SET credential_value_encrypted=EXCLUDED.credential_value_encrypted,updated_at=now()`,[integration.rows[0].id,saved.userId,encryptSecret(token)]);
      await pool.query(`INSERT INTO integration_user_links(integration_id,user_id,provider_user_id,provider_username,revoked_at)
        VALUES($1,$2,$3,$4,NULL) ON CONFLICT(integration_id,user_id)
        DO UPDATE SET provider_user_id=EXCLUDED.provider_user_id,provider_username=EXCLUDED.provider_username,linked_at=now(),revoked_at=NULL`,[integration.rows[0].id,saved.userId,String(profile.id),String(profile.login)]);
      res.statusCode=302;res.setHeader('Location',origin+'/?github=connected');res.end();return true;
    } catch {
      const origin=(process.env.APP_ORIGIN||'/').split(',')[0].replace(/\/$/,'');
      res.statusCode=302;res.setHeader('Location',origin+'/?github=oauth_failed');res.end();return true;
    }
  }
  const user=await authenticateRequest(req);
  if(!user){sendAuthJson(res,401,{error:'Sign in is required.'});return true;}
  if(req.method!=='GET'&&!verifyCsrf(req)){sendAuthJson(res,403,{error:'CSRF validation failed.'});return true;}
  if(req.method==='GET'&&pathname==='/api/integrations/github/status'){
    const row=await pool.query(`SELECT l.provider_username,l.linked_at FROM integration_user_links l
      JOIN integrations i ON i.id=l.integration_id WHERE i.slug='github' AND l.user_id=$1 AND l.revoked_at IS NULL LIMIT 1`,[user.id]);
    sendAuthJson(res,200,{configured:Boolean(process.env.GITHUB_OAUTH_CLIENT_ID&&process.env.GITHUB_OAUTH_CLIENT_SECRET),linked:Boolean(row.rows[0]),username:row.rows[0]?.provider_username||null,linkedAt:row.rows[0]?.linked_at||null});return true;
  }
  if(req.method==='POST'&&pathname==='/api/integrations/github/start'){
    const clientId=process.env.GITHUB_OAUTH_CLIENT_ID||'',origin=(process.env.APP_ORIGIN||'').split(',')[0].trim().replace(/\/$/,'');
    if(!clientId||!origin.startsWith('https://')){sendAuthJson(res,503,{error:'GitHub OAuth is not configured by the platform administrator.'});return true;}
    const state=randomBytes(32).toString('hex');githubOAuthStates.set(state,{userId:user.id,expiresAt:Date.now()+600000});
    for(const [key,value] of githubOAuthStates)if(value.expiresAt<Date.now())githubOAuthStates.delete(key);
    const redirectUri=origin+'/api/integrations/github/callback';
    const authUrl='https://github.com/login/oauth/authorize?'+new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,scope:'read:user repo',state}).toString();
    sendAuthJson(res,200,{authUrl});return true;
  }
  if(req.method==='DELETE'&&pathname==='/api/integrations/github/link'){
    await pool.query(`UPDATE integration_user_links l SET revoked_at=now() FROM integrations i
      WHERE i.id=l.integration_id AND i.slug='github' AND l.user_id=$1`,[user.id]);
    await pool.query(`DELETE FROM integration_user_credentials c USING integrations i
      WHERE i.id=c.integration_id AND i.slug='github' AND c.user_id=$1`,[user.id]);
    sendAuthJson(res,200,{unlinked:true});return true;
  }
  sendAuthJson(res,404,{error:'Account integration route not found.'});return true;
}
