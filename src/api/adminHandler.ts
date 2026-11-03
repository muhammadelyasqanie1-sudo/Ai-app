import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { z } from 'zod';
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const privateNetworkBlockList = new BlockList();
for(const [subnet,prefix] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
  ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4],
] as const) privateNetworkBlockList.addSubnet(subnet,prefix,'ipv4');
for(const [subnet,prefix] of [
  ['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],
  ['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8],
] as const) privateNetworkBlockList.addSubnet(subnet,prefix,'ipv6');
function isPublicRoutableAddress(address:string):boolean{
  const family=isIP(address);
  if(family===0)return false;
  if(family===4)return !privateNetworkBlockList.check(address,'ipv4');
  if(address.toLowerCase().startsWith('::ffff:')){
    const mapped=address.slice(7);
    if(isIP(mapped)===4)return !privateNetworkBlockList.check(mapped,'ipv4');
  }
  return !privateNetworkBlockList.check(address,'ipv6');
}

import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf, verifyUserPassword, requestAdminPasswordReset } from './auth.ts';
import { getProviderAdapter, getProviderRegistry, getVerifiedModelDescriptors, refreshDatabaseProviderAdapters, recordModelHealthResult, invalidateProviderHealth } from '../services/providerGateway.ts';
import { encryptProviderSecret, providerKeyHint } from '../security/providerVault.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';

const ALLOWED_FALLBACK_CAPABILITIES = new Set(['text', 'vision', 'imageGen', 'tts', 'stt']);
const customProviderInput = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(48).regex(/^[a-z0-9][a-z0-9-]+$/),
  displayName: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().url().max(500),
  protocol: z.enum(['openai-compatible','anthropic-messages']).optional(),
}).strict();
const providerKeyInput = z.object({
  apiKey: z.string().trim().min(8).max(8192),
  currentPassword: z.string().min(8).max(256),
  alias: z.literal('default').optional(),
}).strict();
const manualModelInput = z.object({
  providerId: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,47}$/),
  modelId: z.string().trim().min(1).max(300).regex(/^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/),
  displayName: z.string().trim().max(160).optional(),
  contextWindow: z.number().int().min(0).max(10_000_000).optional(),
}).strict();
async function safeCustomProviderUrl(raw: string): Promise<boolean> {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.hash ||
        host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || isIP(host)) return false;
    const addresses=await lookup(host,{all:true,verbatim:true});
    return addresses.length>0 && addresses.every(result=>isPublicRoutableAddress(result.address));
  } catch { return false; }
}

async function requireAdmin(req: IncomingMessage, res: ServerResponse) {
  const user = await authenticateRequest(req);
  if (!user) {
    sendAuthJson(res, 401, { error: 'Sign in is required.' });
    return null;
  }
  if (!['admin','superadmin'].includes(user.role)) {
    sendAuthJson(res, 403, { error: 'Administrator access is required.' });
    return null;
  }
  if (!verifyCsrf(req)) {
    sendAuthJson(res, 403, { error: 'CSRF validation failed.' });
    return null;
  }
  return user;
}

export async function handleAdminApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/admin/')) return false;
  if (!pool) {
    sendAuthJson(res, 503, { error: 'Admin controls require DATABASE_URL and the database schema.' });
    return true;
  }
  if (!['GET', 'PATCH', 'POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    sendAuthJson(res, 405, { error: 'Method not allowed.' });
    return true;
  }

  let user;
  try {
    user = await authenticateRequest(req);
  } catch {
    sendAuthJson(res, 503, { error: 'Could not verify the administrator session.' });
    return true;
  }
  if (!user) {
    sendAuthJson(res, 401, { error: 'Sign in is required.' });
    return true;
  }
  if (!['admin','superadmin'].includes(user.role)) {
    sendAuthJson(res, 403, { error: 'Administrator access is required.' });
    return true;
  }
  if (req.method !== 'GET' && !verifyCsrf(req)) {
    sendAuthJson(res, 403, { error: 'CSRF validation failed.' });
    return true;
  }

  try {
    const policy = await pool.query("SELECT requests,window_seconds FROM rate_limit_policies WHERE scope_type='admin' AND scope_key='*' AND enabled=true LIMIT 1");
    const adminLimit = Number(policy.rows[0]?.requests || 100);
    const adminWindow = Number(policy.rows[0]?.window_seconds || 60);
    const counter = await pool.query(`INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
      VALUES('admin',$1,to_timestamp((floor(extract(epoch FROM now())/$2)*$2)::double precision),1)
      ON CONFLICT(scope_type,scope_key,window_start)
      DO UPDATE SET request_count=rate_limit_counters.request_count+1
      RETURNING request_count`,[user.id,adminWindow]);
    if (Number(counter.rows[0]?.request_count || 0) > adminLimit) {
      res.setHeader('Retry-After',String(adminWindow));
      sendAuthJson(res,429,{error:'Admin API rate limit exceeded.'}); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/providers') {
      await refreshDatabaseProviderAdapters(true);
      const result = await pool.query(`SELECT p.id,p.slug,p.kind,p.display_name,p.base_url,p.enabled,p.config_json,
          p.last_health_at,p.last_health_ok,p.last_error_code,p.source,p.created_at,p.updated_at,
          EXISTS(SELECT 1 FROM provider_keys k WHERE k.provider_id=p.id AND k.status='active') AS has_key,
          (SELECT k.key_hint FROM provider_keys k WHERE k.provider_id=p.id AND k.alias='default' AND k.status='active' LIMIT 1) AS key_hint,
          (SELECT k.status FROM provider_keys k WHERE k.provider_id=p.id AND k.alias='default' ORDER BY k.created_at DESC LIMIT 1) AS key_status
        FROM providers p ORDER BY p.source,p.display_name`);
      const providers=await Promise.all(result.rows.map(async(row)=>{
        const id=String(row.slug||row.kind);
        const adapter=getProviderAdapter(id);
        let runtimeConfigured=false;
        try{runtimeConfigured=Boolean((await adapter?.validateConfig())?.valid);}catch{}
        return {
          ...row,id,displayName:row.display_name,
          configured:runtimeConfigured||Boolean(row.has_key),
          keyHint:user.role==='superadmin'?row.key_hint:null,
          keyStatus:row.key_status,
        };
      }));
      sendAuthJson(res,200,{providers});return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/providers/custom'){
      const body=await readJsonBody(req,8000);
      const parsed=customProviderInput.safeParse(body);
      if(!parsed.success||!safeCustomProviderUrl(parsed.data.baseUrl)){
        sendAuthJson(res,400,{error:'Provide a valid slug, display name, and public HTTPS OpenAI-compatible API base URL.'});return true;
      }
      const {slug,displayName,baseUrl}=parsed.data;
      const protocol=parsed.data.protocol||'openai-compatible';
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const created=await client.query(`INSERT INTO providers(kind,display_name,enabled,slug,base_url,config_json,source)
          VALUES('custom',$1,false,$2,$3,$4::jsonb,'custom')
          RETURNING id,slug,kind,display_name,base_url,enabled,config_json,source,created_at`,
          [displayName,slug,baseUrl,JSON.stringify({protocol,requires_key:true,custom:true})]);
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'provider.custom.create','provider',created.rows[0].id,null,JSON.stringify(created.rows[0]),JSON.stringify({slug,displayName,baseUrl,protocol})]);
        await client.query('COMMIT');
        sendAuthJson(res,201,{provider:created.rows[0]});return true;
      }catch(error){
        await client.query('ROLLBACK');
        if((error as {code?:string})?.code==='23505'){sendAuthJson(res,409,{error:'A provider with this slug already exists.'});return true;}
        throw error;
      }finally{client.release();}
    }



    const providerConfigRoute=pathname.match(/^\/api\/admin\/providers\/([a-z0-9-]+)\/config$/);
    if(req.method==='PATCH'&&providerConfigRoute){
      if(user.role!=='superadmin'){sendAuthJson(res,403,{error:'Only a superadmin can change provider configuration.'});return true;}
      const providerSlug=providerConfigRoute[1];
      const body=await readJsonBody(req,8000);
      const providerConfigInput=z.object({
        baseUrl:z.string().trim().url().max(500),
        displayName:z.string().trim().min(1).max(80).optional(),
        protocol:z.enum(['openai-compatible','anthropic-messages']).optional(),
      }).strict().safeParse(body);
      if(!providerConfigInput.success||!(await safeCustomProviderUrl(providerConfigInput.data.baseUrl))){
        sendAuthJson(res,400,{error:'Provide a public HTTPS provider URL and valid configuration.'});return true;
      }
      const before=await pool.query('SELECT slug,display_name,base_url,config_json FROM providers WHERE slug=$1 LIMIT 1',[providerSlug]);
      if(!before.rows[0]){sendAuthJson(res,404,{error:'Provider not found.'});return true;}
      if(['cloudflare','ollama'].includes(String(before.rows[0].slug))){
        sendAuthJson(res,409,{error:'This provider endpoint is managed by the host environment.'});return true;
      }
      const configJson={...(before.rows[0].config_json||{}),protocol:providerConfigInput.data.protocol||
        (before.rows[0].config_json as any)?.protocol||'openai-compatible'};
      const updated=await pool.query(`UPDATE providers SET base_url=$2,display_name=COALESCE($3,display_name),
        config_json=$4::jsonb,last_health_at=NULL,last_health_ok=NULL,last_error_code=NULL,updated_at=now()
        WHERE slug=$1 RETURNING slug,display_name,base_url,config_json`,
        [providerSlug,providerConfigInput.data.baseUrl,providerConfigInput.data.displayName||null,JSON.stringify(configJson)]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'provider.config.update','provider',providerSlug,JSON.stringify(before.rows[0]),JSON.stringify(updated.rows[0]),JSON.stringify({protocol:configJson.protocol})]);
      invalidateProviderHealth(providerSlug);
      await refreshDatabaseProviderAdapters(true);
      sendAuthJson(res,200,{provider:updated.rows[0]});return true;
    }

    const keyRoute = pathname.match(/^\/api\/admin\/providers\/([a-z0-9-]+)\/keys(?:\/rotate)?$/);
    if (keyRoute && ((req.method==='PUT' && !pathname.endsWith('/rotate')) || (req.method==='POST' && pathname.endsWith('/rotate')))) {
      if (user.role !== 'superadmin') { sendAuthJson(res,403,{error:'Superadmin access is required to manage provider keys.'}); return true; }
      const providerSlug=keyRoute[1];
      const body=await readJsonBody(req,10000);
      const parsedKey=providerKeyInput.safeParse(body);
      if(!parsedKey.success){sendAuthJson(res,400,{error:'Provide a valid provider API key. Only the default key alias is currently supported.'});return true;}
      const secret=parsedKey.data.apiKey;
      const alias='default';
      if(!(await verifyUserPassword(user.id,parsedKey.data.currentPassword))){
        sendAuthJson(res,403,{error:'Administrator re-authentication failed. Enter your current account password.'});return true;
      }
      const provider=await pool.query('SELECT id,slug FROM providers WHERE slug=$1 LIMIT 1',[providerSlug]);
      if(!provider.rows[0]){sendAuthJson(res,404,{error:'Provider not found.'});return true;}
      let encrypted:string;
      try{encrypted=encryptProviderSecret(secret);}catch{
        sendAuthJson(res,503,{error:'Provider key vault is not configured. Set PROVIDER_KEYS_MASTER_KEY to a 32-byte base64 or 64-character hex key.'});return true;
      }
      const hint=providerKeyHint(secret);
      const previousKey=await pool.query('SELECT key_hint,status,rotated_at FROM provider_keys WHERE provider_id=$1 AND alias=$2 LIMIT 1',[provider.rows[0].id,alias]);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query(`INSERT INTO provider_keys(provider_id,alias,key_encrypted,key_hint,status,rotated_at)
          VALUES($1,$2,$3,$4,'active',CASE WHEN $5 THEN now() ELSE NULL END)
          ON CONFLICT(provider_id,alias) DO UPDATE SET key_encrypted=EXCLUDED.key_encrypted,key_hint=EXCLUDED.key_hint,status='active',rotated_at=now()`,
          [provider.rows[0].id,alias,encrypted,hint,pathname.endsWith('/rotate')]);
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,pathname.endsWith('/rotate')?'provider.key.rotate':'provider.key.set','provider',providerSlug,
            previousKey.rows[0]?JSON.stringify({keyHint:previousKey.rows[0].key_hint,status:previousKey.rows[0].status,rotatedAt:previousKey.rows[0].rotated_at}):null,
            JSON.stringify({keyHint:hint,status:'active'}),JSON.stringify({alias})]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      invalidateProviderHealth(providerSlug);
      await refreshDatabaseProviderAdapters(true);
      sendAuthJson(res,200,{providerId:providerSlug,alias,keyHint:hint,status:'active'});return true;
    }

    const discoverRoute=pathname.match(/^\/api\/admin\/providers\/([a-z0-9-]+)\/discover-models$/);
    if(req.method==='POST' && discoverRoute){
      const providerId=discoverRoute[1];
      await refreshDatabaseProviderAdapters(true);
      const adapter=getProviderAdapter(providerId);
      if(!adapter){sendAuthJson(res,404,{error:'Provider adapter is not implemented or is not configured.'});return true;}
      const config=await adapter.validateConfig();
      if(!config.valid){sendAuthJson(res,409,{error:'Provider credentials are not configured.'});return true;}
      const discovered=await adapter.listModels();
      const existingCount=await pool.query('SELECT count(*)::int AS total FROM model_catalog WHERE provider_key=$1',[providerId]);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        for(const model of discovered){
          await client.query(`INSERT INTO model_catalog(provider_key,model_key,display_name,description,capabilities,enabled,context_window,discovered_at,last_health_ok,verified_at,max_output,pricing_json,input_cost_per_million,output_cost_per_million)
            VALUES($1,$2,$3,$4,$5,false,$6,now(),false,NULL,$7,$8::jsonb,$9,$10)
            ON CONFLICT(provider_key,model_key) DO UPDATE SET display_name=EXCLUDED.display_name,
              description=EXCLUDED.description,capabilities=EXCLUDED.capabilities,context_window=EXCLUDED.context_window,
              max_output=COALESCE(EXCLUDED.max_output,model_catalog.max_output),
              pricing_json=COALESCE(EXCLUDED.pricing_json,model_catalog.pricing_json),
              input_cost_per_million=COALESCE(EXCLUDED.input_cost_per_million,model_catalog.input_cost_per_million),
              output_cost_per_million=COALESCE(EXCLUDED.output_cost_per_million,model_catalog.output_cost_per_million),
              discovered_at=now(),updated_at=now()`,
            [providerId,model.id,model.displayName,model.description,
              Object.entries(model.capabilities).filter(([,enabled])=>enabled).map(([name])=>name),model.contextWindow,model.maxOutput||null,model.pricing?JSON.stringify(model.pricing):null,model.pricing?.inputPerMillion??null,model.pricing?.outputPerMillion??null]);
        }
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'provider.models.discover','provider',providerId,
            JSON.stringify({registeredModels:Number(existingCount.rows[0]?.total||0)}),
            JSON.stringify({discoveredModels:discovered.length,enabledByDefault:false}),JSON.stringify({discovered:discovered.length})]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      sendAuthJson(res,200,{providerId,discovered:discovered.length,enabledByDefault:false});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/subscription-plans') {
      const result = await pool.query(`SELECT plan_key,display_name,monthly_price_usd,limits_json,features_json,enabled
        FROM subscription_plans ORDER BY monthly_price_usd,plan_key`);
      sendAuthJson(res, 200, { plans: result.rows }); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/subscriptions') {
      const result = await pool.query(`SELECT s.id,s.user_id,u.email,p.plan_key,p.display_name AS plan_name,
          s.status,s.starts_at,s.ends_at,s.provider,s.created_at
        FROM user_subscriptions s JOIN users u ON u.id=s.user_id
        JOIN subscription_plans p ON p.id=s.plan_id
        ORDER BY s.created_at DESC LIMIT 300`);
      sendAuthJson(res, 200, { subscriptions: result.rows }); return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/subscriptions') {
      const body = await readJsonBody(req, 8000);
      const targetId = typeof body.userId === 'string' ? body.userId : '';
      const planKey = typeof body.planKey === 'string' ? body.planKey : '';
      if (!targetId || !['free','pro'].includes(planKey)) {
        sendAuthJson(res, 400, { error: 'Provide a user ID and an enabled free or pro plan.' }); return true;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const plan = await client.query('SELECT id,plan_key FROM subscription_plans WHERE plan_key=$1 AND enabled=true FOR SHARE',[planKey]);
        const target = await client.query("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[targetId]);
        if (!plan.rows[0] || !target.rows[0]) {
          await client.query('ROLLBACK');
          sendAuthJson(res, 404, { error: 'Active user or enabled plan not found.' }); return true;
        }
        const previousSubscription=await client.query("SELECT p.plan_key,s.status,s.starts_at,s.ends_at FROM user_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status IN ('active','trialing') ORDER BY s.starts_at DESC LIMIT 1",[targetId]);
        await client.query("UPDATE user_subscriptions SET status='cancelled',ends_at=now(),updated_at=now() WHERE user_id=$1 AND status IN ('active','trialing')",[targetId]);
        const created = await client.query(`INSERT INTO user_subscriptions(user_id,plan_id,status,provider)
          VALUES($1,$2,'active','admin_manual') RETURNING id,status,starts_at`,[targetId,plan.rows[0].id]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'subscription.plan.assign','user',targetId,JSON.stringify({planKey,subscriptionId:created.rows[0].id,source:'admin_manual'})]);
        await client.query('COMMIT');
        sendAuthJson(res, 200, { subscription: {...created.rows[0],planKey} }); return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const result = await pool.query(`
        SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,
          (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen_at,
          (SELECT count(*)::int FROM usage_events e WHERE e.user_id=u.id AND e.created_at>now()-interval '30 days') AS requests_30d
        FROM users u ORDER BY u.created_at DESC LIMIT 250`);
      sendAuthJson(res, 200, { users: result.rows }); return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/users') {
      const body = await readJsonBody(req, 8000);
      const targetId = typeof body.userId === 'string' ? body.userId : '';
      const role = typeof body.role === 'string' ? body.role : undefined;
      const status = typeof body.status === 'string' ? body.status : undefined;
      if(status==='deleted'){
        const currentPassword=typeof body.currentPassword==='string'?body.currentPassword:'';
        if(!(await verifyUserPassword(user.id,currentPassword))){
          sendAuthJson(res,403,{error:'Administrator re-authentication failed. Enter your current account password.'});return true;
        }
      }
      if (!targetId || (role !== undefined && !['user','admin','superadmin'].includes(role)) ||
          (role === 'superadmin' && user.role !== 'superadmin') ||
          (status !== undefined && !['active','suspended','deleted'].includes(status)) ||
          (role === undefined && status === undefined)) {
        sendAuthJson(res, 400, { error: 'Provide a user ID and a valid role or status.' }); return true;
      }
      if (targetId === user.id && (role === 'user' || status === 'suspended' || status === 'deleted')) {
        sendAuthJson(res,400,{error:'You cannot remove or suspend your own administrator account.'});return true;
      }
      if(status==='deleted'&&user.role!=='superadmin'){
        sendAuthJson(res,403,{error:'Only a superadmin can soft-delete accounts.'});return true;
      }
      const client = await pool.connect();
      let updatedUser;
      try {
        await client.query('BEGIN');
        // Share the bootstrap lock so concurrent admin changes cannot remove the last active administrator.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('afg-ai:admin-bootstrap'))");
        const target = await client.query(
          "SELECT id,role,status FROM users WHERE id=$1 AND status <> 'deleted' FOR UPDATE",
          [targetId],
        );
        if (!target.rows[0]) {
          await client.query('ROLLBACK');
          sendAuthJson(res, 404, { error: 'User not found.' }); return true;
        }
        const nextRole = role ?? target.rows[0].role;
        const nextStatus = status ?? target.rows[0].status;
        if(target.rows[0].role==='superadmin' && user.role!=='superadmin'){
          await client.query('ROLLBACK');sendAuthJson(res,403,{error:'Only a superadmin may modify another superadmin.'});return true;
        }
        const removingActiveAdmin = ['admin','superadmin'].includes(target.rows[0].role) && target.rows[0].status === 'active' &&
          (!['admin','superadmin'].includes(nextRole) || nextStatus !== 'active');
        const removingSuperadmin = target.rows[0].role==='superadmin' && target.rows[0].status==='active' &&
          (nextRole!=='superadmin' || nextStatus!=='active');
        if (removingActiveAdmin) {
          const admins = await client.query("SELECT count(*)::int AS total FROM users WHERE role IN ('admin','superadmin') AND status='active'");
          if (Number(admins.rows[0]?.total || 0) <= 1) {
            await client.query('ROLLBACK');
            sendAuthJson(res,409,{error:'At least one active administrator must remain.'});return true;
          }
        }
        if(removingSuperadmin){
          const superadmins=await client.query("SELECT count(*)::int AS total FROM users WHERE role='superadmin' AND status='active'");
          if(Number(superadmins.rows[0]?.total||0)<=1){
            await client.query('ROLLBACK');sendAuthJson(res,409,{error:'At least one active superadmin must remain.'});return true;
          }
        }
        const result = await client.query(`
          UPDATE users SET role=COALESCE($2,role),status=COALESCE($3,status),
            deleted_at=CASE WHEN $3='deleted' THEN now() WHEN $3='active' THEN NULL ELSE deleted_at END,updated_at=now()
          WHERE id=$1 AND status <> 'deleted' RETURNING id,role,status,deleted_at`,
          [targetId, role ?? null, status ?? null]);
        updatedUser = result.rows[0];
        if (status === 'suspended' || status === 'deleted' || role !== undefined) {
          await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[targetId]);
        }
        await client.query(
          'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'user.access.update','user',targetId,JSON.stringify({role:target.rows[0].role,status:target.rows[0].status}),JSON.stringify({role:updatedUser.role,status:updatedUser.status}),JSON.stringify({role:role ?? null,status:status ?? null})],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { user: updatedUser }); return true;
    }

    const userPasswordResetRoute=pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/password-reset$/i);
    if(req.method==='POST'&&userPasswordResetRoute){
      const targetId=userPasswordResetRoute[1];
      const target=await pool.query('SELECT email FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',[targetId]);
      if(!target.rows[0]){sendAuthJson(res,404,{error:'Active user not found.'});return true;}
      const result=await requestAdminPasswordReset(targetId);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'user.password_reset.request','user',targetId,JSON.stringify({passwordReset:'not_requested'}),JSON.stringify({passwordReset:result.sent?'email_queued':'not_sent'}),JSON.stringify({deliveryConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)})]);
      sendAuthJson(res,200,{requested:true,sent:result.sent,message:result.sent?'Password reset instructions were emailed.':'Password reset email could not be sent; verify email and mail configuration.'});return true;
    }

    const userDetailRoute=pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
    if(req.method==='GET'&&userDetailRoute){
      const targetId=userDetailRoute[1];
      const [profile,usage,conversations,activity]=await Promise.all([
        pool.query(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,u.deleted_at,
          (SELECT max(last_seen_at) FROM sessions WHERE user_id=u.id) AS last_login
          FROM users u WHERE u.id=$1 LIMIT 1`,[targetId]),
        pool.query(`SELECT COALESCE(sum(tokens_in),0)::bigint AS input_tokens,COALESCE(sum(tokens_out),0)::bigint AS output_tokens,
          COALESCE(sum(cost_usd),0)::numeric(18,6) AS total_cost,count(*)::int AS request_count
          FROM usage_records WHERE user_id=$1`,[targetId]),
        pool.query('SELECT count(*)::int AS total FROM conversations WHERE user_id=$1',[targetId]),
        pool.query(`SELECT id,request_id,provider_key,model_key,tokens_in,tokens_out,cost_usd,latency_ms,status,created_at
          FROM usage_records WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`,[targetId]),
      ]);
      if(!profile.rows[0]){sendAuthJson(res,404,{error:'User not found.'});return true;}
      sendAuthJson(res,200,{user:{...profile.rows[0],usage:usage.rows[0],conversationCount:conversations.rows[0]?.total||0,activity:activity.rows}});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const [usage,requests,users,storage,today,latency,requestsByProvider,errorsByClass,providerHealth,unverified,expiredKeys,problemModels,threshold] = await Promise.all([
        pool.query(`SELECT date_trunc('day',created_at) AS day,count(*)::int AS requests,
          COALESCE(sum(input_tokens+output_tokens),0)::bigint AS tokens
          FROM usage_events WHERE created_at>now()-interval '14 days' GROUP BY 1 ORDER BY 1`),
        pool.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE status_code>=500)::int AS server_errors,
          count(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS client_errors,
          count(*) FILTER (WHERE status_code<400)::int AS successful
          FROM admin_request_events WHERE created_at>now()-interval '24 hours'`),
        pool.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE status='active')::int AS active,
          count(*) FILTER (WHERE status='suspended')::int AS suspended FROM users`),
        pool.query(`SELECT pg_database_size(current_database())::bigint AS database_bytes,
          (SELECT count(*)::bigint FROM generated_assets) AS asset_records,
          (SELECT count(*)::bigint FROM conversations) AS conversations`),
        pool.query(`SELECT count(*)::int AS ai_requests, count(*) FILTER(WHERE status<>'success')::int AS errors,
          COALESCE(sum(cost_usd),0)::numeric(18,6) AS cost_usd,
          count(*) FILTER(WHERE cost_usd IS NOT NULL)::int AS priced_requests,count(*) FILTER(WHERE cost_usd IS NULL)::int AS unpriced_requests,
          COALESCE(sum(tokens_in),0)::bigint AS input_tokens,COALESCE(sum(tokens_out),0)::bigint AS output_tokens,
          count(DISTINCT user_id) FILTER(WHERE user_id IS NOT NULL)::int AS active_request_users
          FROM usage_records WHERE created_at>=date_trunc('day',now())`),
        pool.query(`SELECT COALESCE(avg(latency_ms),0)::numeric(12,2) AS average_ms,
          COALESCE(percentile_cont(0.50) WITHIN GROUP(ORDER BY latency_ms),0)::numeric(12,2) AS p50,
          COALESCE(percentile_cont(0.95) WITHIN GROUP(ORDER BY latency_ms),0)::numeric(12,2) AS p95,
          COALESCE(percentile_cont(0.99) WITHIN GROUP(ORDER BY latency_ms),0)::numeric(12,2) AS p99
          FROM usage_records WHERE created_at>=now()-interval '24 hours'`),
        pool.query(`SELECT provider_key,count(*)::int AS requests,COALESCE(sum(cost_usd),0)::numeric(18,6) AS cost_usd
          FROM usage_records WHERE created_at>=now()-interval '24 hours' GROUP BY provider_key ORDER BY requests DESC`),
        pool.query(`SELECT error_class,count(*)::int AS errors FROM error_logs
          WHERE created_at>=now()-interval '24 hours' GROUP BY error_class ORDER BY errors DESC`),
        pool.query(`SELECT count(*) FILTER(WHERE enabled=true AND last_health_ok=false)::int AS down,
          count(*) FILTER(WHERE enabled=true AND last_health_ok IS NULL)::int AS unchecked
          FROM providers`),
        pool.query(`SELECT count(*)::int AS total FROM model_catalog
          WHERE enabled=true AND (last_health_ok IS DISTINCT FROM true OR verified_at IS NULL OR verified_at<now()-interval '24 hours')`),
        pool.query(`SELECT count(*)::int AS total FROM provider_keys WHERE status='expired'`),
        pool.query(`SELECT model_id,count(*)::int AS errors FROM error_logs WHERE created_at>now()-interval '5 minutes'
          AND model_id IS NOT NULL GROUP BY model_id HAVING count(*)>10 ORDER BY errors DESC`),
        pool.query(`SELECT value_json #>> '{}' AS value FROM system_config WHERE key='daily_cost_threshold_usd' LIMIT 1`),
      ]);
      const todayCost=Number(today.rows[0]?.cost_usd||0);
      const dailyThreshold=Number(threshold.rows[0]?.value||0);
      const totalRequests=Number(today.rows[0]?.ai_requests||0);
      const errorCount=Number(today.rows[0]?.errors||0);
      const pricedRequests=Number(today.rows[0]?.priced_requests||0);
      const unpricedRequests=Number(today.rows[0]?.unpriced_requests||0);
      const costCoveragePercent=totalRequests?pricedRequests/totalRequests*100:0;
      const errorRate=totalRequests?errorCount/totalRequests*100:0;
      const alertItems:Array<{kind:string;severity:string;message:string;count?:number}>=[];
      if(Number(providerHealth.rows[0]?.down||0)>0)alertItems.push({kind:'providers_down',severity:'critical',message:'One or more enabled providers failed their last health check.',count:Number(providerHealth.rows[0].down)});
      if(Number(unverified.rows[0]?.total||0)>0)alertItems.push({kind:'models_unverified',severity:'warning',message:'Enabled models require a recent successful verification.',count:Number(unverified.rows[0].total)});
      if(Number(expiredKeys.rows[0]?.total||0)>0)alertItems.push({kind:'keys_expired',severity:'warning',message:'One or more provider keys are marked expired.',count:Number(expiredKeys.rows[0].total)});
      if(errorRate>5)alertItems.push({kind:'error_rate',severity:'critical',message:'AI request error rate is above 5%.',count:Number(errorRate.toFixed(2))});
      if(dailyThreshold>0&&todayCost>dailyThreshold)alertItems.push({kind:'daily_cost',severity:'critical',message:'Known daily AI cost is above the configured budget threshold.'});
      if(unpricedRequests>0)alertItems.push({kind:'cost_incomplete',severity:'warning',message:'Some requests have no published pricing; displayed cost is a partial known-cost total.',count:unpricedRequests});
      for(const row of problemModels.rows)alertItems.push({kind:'problem_model',severity:'critical',message:'Model has more than 10 errors in the last five minutes: '+row.model_id,count:Number(row.errors)});
      sendAuthJson(res,200,{
        usage:usage.rows,requests:requests.rows[0],users:users.rows,
        dashboard:{
          activeUsersToday:Number(today.rows[0]?.active_request_users||0),aiRequestsToday:totalRequests,
          errorRatePercent:Number(errorRate.toFixed(2)),todayCostUsd:todayCost,
          inputTokens:Number(today.rows[0]?.input_tokens||0),outputTokens:Number(today.rows[0]?.output_tokens||0),
          averageLatencyMs:Number(latency.rows[0]?.average_ms||0),
          latency:{p50:Number(latency.rows[0]?.p50||0),p95:Number(latency.rows[0]?.p95||0),p99:Number(latency.rows[0]?.p99||0)},
          requestsByProvider:requestsByProvider.rows,errorsByClass:errorsByClass.rows,
          dailyCostThresholdUsd:dailyThreshold,costCoveragePercent:Number(costCoveragePercent.toFixed(1)),pricedRequests,unpricedRequests,alerts:alertItems,
        },
        storage:{...storage.rows[0],r2Configured:Boolean(process.env.R2_BUCKET&&(process.env.R2_ACCESS_KEY_ID||process.env.CLOUDFLARE_R2_ACCESS_KEY_ID)),kvConfigured:Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID||process.env.KV_REST_API_URL)}
      });return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/requests') {
      const result = await pool.query(`SELECT request_id,method,route,status_code,duration_ms,classification,created_at
        FROM admin_request_events ORDER BY created_at DESC LIMIT 150`);
      sendAuthJson(res, 200, { requests: result.rows }); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/audit') {
      const query=new URL(req.url||'/','http://localhost').searchParams;
      const values:unknown[]=[];const where:string[]=[];
      if(query.get('from')){values.push(query.get('from'));where.push(`a.created_at >= ${values.length}::timestamptz`);}
      if(query.get('to')){values.push(query.get('to'));where.push(`a.created_at <= ${values.length}::timestamptz`);}
      if(query.get('actor')){values.push(query.get('actor'));where.push(`(u.email ILIKE ${values.length} OR a.actor_user_id::text=${values.length})`);}
      const clause=where.length?'WHERE '+where.join(' AND '):'';
      const result = await pool.query(`SELECT a.id,a.actor_user_id,u.email AS actor_email,a.actor_role,a.action,
        a.target_type,a.target_id,a.before_json,a.after_json,a.metadata,a.ip,a.user_agent,a.created_at
        FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ${clause}
        ORDER BY a.id DESC LIMIT 500`,values);
      sendAuthJson(res,200,{events:result.rows});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/security-events') {
      const result = await pool.query(`SELECT id,event_type,severity,user_id,request_id,ip_hash,metadata,created_at
        FROM security_events ORDER BY created_at DESC LIMIT 250`);
      sendAuthJson(res, 200, { events: result.rows }); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/rate-limits') {
      const result = await pool.query('SELECT id,scope_type,scope_key,requests,window_seconds,enabled,updated_at FROM rate_limit_policies ORDER BY scope_type,scope_key');
      sendAuthJson(res, 200, { policies: result.rows }); return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/rate-limits') {
      const body = await readJsonBody(req, 8000);
      const scopeType = typeof body.scopeType === 'string' ? body.scopeType : '';
      const scopeKey = typeof body.scopeKey === 'string' ? body.scopeKey.trim().slice(0,180) : '';
      const requests = Number(body.requests), windowSeconds = Number(body.windowSeconds);
      const enabled = body.enabled !== false;
      if (!['user','tier','model'].includes(scopeType) || !scopeKey ||
          !Number.isInteger(requests) || requests < 1 || requests > 1000000 ||
          !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) {
        sendAuthJson(res, 400, { error: 'Invalid rate-limit policy.' }); return true;
      }
      const client = await pool.connect();
      let policy;
      try {
        await client.query('BEGIN');
        const beforePolicy=await client.query('SELECT id,scope_type,scope_key,requests,window_seconds,enabled FROM rate_limit_policies WHERE scope_type=$1 AND scope_key=$2 LIMIT 1',[scopeType,scopeKey]);
        const result = await client.query(`INSERT INTO rate_limit_policies(scope_type,scope_key,requests,window_seconds,enabled,updated_by)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(scope_type,scope_key) DO UPDATE SET
          requests=EXCLUDED.requests,window_seconds=EXCLUDED.window_seconds,enabled=EXCLUDED.enabled,
          updated_by=EXCLUDED.updated_by,updated_at=now()
          RETURNING id,scope_type,scope_key,requests,window_seconds,enabled,updated_at`,
          [scopeType,scopeKey,requests,windowSeconds,enabled,user.id]);
        policy = result.rows[0];
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'rate_limit.update','rate_limit',scopeType+':'+scopeKey,
            beforePolicy.rows[0]?JSON.stringify(beforePolicy.rows[0]):null,JSON.stringify(policy),
            JSON.stringify({requests,windowSeconds,enabled})]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { policy }); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/feature-flags') {
      const result = await pool.query('SELECT flag_key,enabled,description,updated_at FROM feature_flags ORDER BY flag_key');
      sendAuthJson(res, 200, { flags: result.rows }); return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/feature-flags') {
      const body = await readJsonBody(req, 8000);
      if (typeof body.key !== 'string' || !/^[a-z][a-z0-9_.-]{1,79}$/.test(body.key) || typeof body.enabled !== 'boolean') {
        sendAuthJson(res, 400, { error: 'A valid feature flag key and boolean enabled value are required.' }); return true;
      }
      const description = typeof body.description === 'string' ? body.description.trim().slice(0,300) : '';
      const requestedKey=body.key as string;
      const aliases:Record<string,string[]> = {
        research:['research','web_research_enabled'],
        web_research_enabled:['research','web_research_enabled'],
        voice:['voice','voice_enabled'],
        voice_enabled:['voice','voice_enabled'],
      };
      const keysToUpdate=aliases[requestedKey]||[requestedKey];
      if(body.enabled===true){
        if(['terminal_exec_enabled','offline_sync_enabled'].includes(requestedKey)){
          sendAuthJson(res,409,{error:requestedKey==='terminal_exec_enabled'
            ? 'Shell execution cannot be enabled until a real isolated command sandbox is deployed and verified.'
            : 'Offline synchronization cannot be enabled until signed pack synchronization is implemented and configured.'});return true;
        }
        if(requestedKey==='research'||requestedKey==='web_research_enabled'){
          if(!process.env.TAVILY_API_KEY){sendAuthJson(res,409,{error:'Configure TAVILY_API_KEY on the server before enabling web research.'});return true;}
        }
        if(requestedKey==='voice'||requestedKey==='voice_enabled'){
          const descriptors=await getVerifiedModelDescriptors();
          const ready=descriptors.some(model=>model.enabled&&model.verifiedAt&&(
            (model.capabilities.stt&&Boolean(getProviderAdapter(model.providerId)?.transcribe))||
            (model.capabilities.tts&&Boolean(getProviderAdapter(model.providerId)?.synthesize))
          ));
          if(!ready){sendAuthJson(res,409,{error:'Voice cannot be enabled until a model with a verified transcription or synthesis endpoint is available.'});return true;}
        }
        if(requestedKey==='image_generation_enabled'){
          const descriptors=await getVerifiedModelDescriptors();
          const ready=descriptors.some(model=>model.enabled&&model.verifiedAt&&model.capabilities.imageGen&&
            Boolean(getProviderAdapter(model.providerId)?.generateImage)&&Boolean(getProviderAdapter(model.providerId)?.imageGenerationOptions?.(model.id)));
          if(!ready){sendAuthJson(res,409,{error:'Image generation cannot be enabled until a verified image-generation model and generation adapter are available.'});return true;}
        }
        if(requestedKey==='chat'){
          const descriptors=await getVerifiedModelDescriptors();
          if(!descriptors.some(model=>model.enabled&&model.verifiedAt&&model.capabilities.text&&model.capabilities.streaming)){
            sendAuthJson(res,409,{error:'Chat cannot be enabled until at least one verified streaming text model is available.'});return true;
          }
        }
      }
      const previousFlag=await pool.query('SELECT flag_key,enabled,description FROM feature_flags WHERE flag_key=ANY($1::text[])',[keysToUpdate]);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const updatedRows=[];
        for(const flagKey of keysToUpdate){
          const updatedFlag=await client.query(`INSERT INTO feature_flags(flag_key,enabled,description,updated_by) VALUES($1,$2,$3,$4)
            ON CONFLICT(flag_key) DO UPDATE SET enabled=EXCLUDED.enabled,description=EXCLUDED.description,
            updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING flag_key,enabled,description`,
            [flagKey,body.enabled,description,user.id]);
          updatedRows.push(updatedFlag.rows[0]);
        }
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'feature_flag.update','feature_flag',body.key,
            previousFlag.rows.length?JSON.stringify(previousFlag.rows):null,JSON.stringify(updatedRows),
            JSON.stringify({enabled:body.enabled,aliases:keysToUpdate})]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { key: body.key, enabled: body.enabled }); return true;
    }

    if (req.method === 'POST' && (pathname === '/api/admin/providers/test' || /^\/api\/admin\/providers\/[a-z0-9-]+\/test$/.test(pathname))) {
      const body = await readJsonBody(req,4000);
      const routeId=pathname.match(/^\/api\/admin\/providers\/([a-z0-9-]+)\/test$/)?.[1];
      const providerId=routeId || (typeof body.providerId==='string'?body.providerId:'');
      if(!providerId){sendAuthJson(res,400,{error:'Provider ID is required.'});return true;}
      await refreshDatabaseProviderAdapters(true);
      const providerRow=await pool.query('SELECT slug,display_name,enabled,kind,last_health_at,last_health_ok,last_error_code FROM providers WHERE slug=$1 LIMIT 1',[providerId]);
      const adapter=getProviderAdapter(providerId);
      if(!providerRow.rows[0]&&!adapter){sendAuthJson(res,404,{error:'Provider not found.'});return true;}
      const started=Date.now();let configured=false,connected=false,discoveredModels=0,probeModel:string|null=null,providerFailureStatus:number|null=null;
      try{
        const config=await adapter?.validateConfig();configured=Boolean(config?.valid);
        if(configured&&adapter){
          const models=await adapter.listModels();discoveredModels=models.length;
          probeModel=models[0]?.id||null;
          if(probeModel){const probe=await adapter.healthCheck(probeModel);connected=probe.healthy;}
          else connected=false;
        }
      }catch(error){connected=false;if(error instanceof ProviderAdapterError)providerFailureStatus=error.status;}
      const latencyMs=Date.now()-started;
      if(providerRow.rows[0])await pool.query('UPDATE providers SET last_health_at=now(),last_health_ok=$2,last_error_code=$3,updated_at=now() WHERE slug=$1',
        [providerId,connected,connected?null:(configured?'provider_probe_failed':'credentials_missing')]);
      await pool.query(`UPDATE provider_keys k SET last_used_at=now(),status=CASE WHEN $3 THEN 'invalid' ELSE 'active' END
        FROM providers p WHERE p.id=k.provider_id AND p.slug=$1 AND k.alias='default' AND k.status IN ('active','invalid')`,
        [providerId,connected,providerFailureStatus===401||providerFailureStatus===403]).catch(()=>{});
      const providerAfter=providerRow.rows[0]?await pool.query('SELECT slug,enabled,last_health_at,last_health_ok,last_error_code FROM providers WHERE slug=$1 LIMIT 1',[providerId]):{rows:[] as any[]};
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'provider.connection_test','provider',providerId,
          providerRow.rows[0]?JSON.stringify({enabled:providerRow.rows[0].enabled,lastHealthAt:providerRow.rows[0].last_health_at,lastHealthOk:providerRow.rows[0].last_health_ok,lastErrorCode:providerRow.rows[0].last_error_code}):null,
          providerAfter.rows[0]?JSON.stringify(providerAfter.rows[0]):JSON.stringify({connected,configured}),
          JSON.stringify({configured,connected,discoveredModels,probeModel,latencyMs})]);
      sendAuthJson(res,connected?200:502,{providerId,configured,connected,discoveredModels,probeModel,latencyMs,
        message:connected?'Provider inference probe succeeded.':(configured?'Provider inference probe failed.':'Provider credentials are not configured or adapter is unavailable.')});return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/models/discover') {
      const models = await getVerifiedModelDescriptors();
      sendAuthJson(res, 200, { discovered: models.length, healthy: models.filter((model) => model.verifiedAt).length });
      return true;
    }

    if(req.method==='GET' && pathname==='/api/admin/usage'){
      const query=new URL(req.url||'/','http://localhost').searchParams;
      const values:unknown[]=[];const where:string[]=[];
      const add=(column:string,value:string|null)=>{if(value){values.push(value);where.push(`${column}=${values.length}`);}};
      const from=query.get('from'),to=query.get('to');
      if(from){values.push(from);where.push(`created_at >= ${values.length}::timestamptz`);}
      if(to){values.push(to);where.push(`created_at <= ${values.length}::timestamptz`);}
      add('user_id',query.get('user'));add('provider_key',query.get('provider'));add('model_key',query.get('model'));
      const clause=where.length?'WHERE '+where.join(' AND '):'';
      const [rows,summary]=await Promise.all([
        pool.query(`SELECT id,user_id,provider_key,model_key,request_id,tokens_in,tokens_out,cost_usd,latency_ms,status,created_at
          FROM usage_records ${clause} ORDER BY created_at DESC LIMIT 500`,values),
        pool.query(`SELECT COALESCE(sum(tokens_in),0)::bigint AS input_tokens,COALESCE(sum(tokens_out),0)::bigint AS output_tokens,
          COALESCE(sum(cost_usd),0)::numeric(18,6) AS cost_usd,COALESCE(avg(latency_ms),0)::numeric(12,2) AS avg_latency_ms,
          count(*)::int AS requests,count(*) FILTER(WHERE status<>'success')::int AS errors,
          count(*) FILTER(WHERE cost_usd IS NOT NULL)::int AS priced_requests,count(*) FILTER(WHERE cost_usd IS NULL)::int AS unpriced_requests
          FROM usage_records ${clause}`,values),
      ]);
      sendAuthJson(res,200,{records:rows.rows,summary:summary.rows[0]});return true;
    }

    if(req.method==='GET' && pathname==='/api/admin/errors'){
      const query=new URL(req.url||'/','http://localhost').searchParams;
      const values:unknown[]=[];const where:string[]=[];
      const add=(column:string,value:string|null)=>{if(value){values.push(value);where.push(`${column}=${values.length}`);}};
      if(query.get('from')){values.push(query.get('from'));where.push(`created_at >= ${values.length}::timestamptz`);}
      if(query.get('to')){values.push(query.get('to'));where.push(`created_at <= ${values.length}::timestamptz`);}
      add('error_class',query.get('class'));add('model_id',query.get('model'));
      const clause=where.length?'WHERE '+where.join(' AND '):'';
      const result=await pool.query(`SELECT id,request_id,user_id,provider_key,model_id,error_code,error_class,message_redacted,metadata_json,created_at
        FROM error_logs ${clause} ORDER BY created_at DESC LIMIT 1000`,values);
      sendAuthJson(res,200,{errors:result.rows});return true;
    }

    if(req.method==='GET' && pathname==='/api/admin/errors/export'){
      const query=new URL(req.url||'/','http://localhost').searchParams;
      const from=query.get('from'),to=query.get('to');
      const result=await pool.query(`SELECT request_id,error_code,error_class,message_redacted,metadata_json,created_at
        FROM error_logs WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz)
        ORDER BY created_at DESC LIMIT 5000`,[from,to]);
      const csvCell=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""').replace(/[\r\n]+/g,' ').slice(0,2000)+'"';
      const header=['request_id','error_code','error_class','message_redacted','metadata_json','created_at'];
      const lines=[header.join(','),...result.rows.map((row)=>header.map((key)=>csvCell(key==='metadata_json'?JSON.stringify(row[key]):row[key])).join(','))];
      res.statusCode=200;res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="afg-ai-errors.csv"');res.setHeader('Cache-Control','no-store');res.end(lines.join('\n'));return true;
    }

    if(req.method==='GET' && pathname==='/api/admin/config'){
      const result=await pool.query('SELECT key,value_json,updated_at FROM system_config ORDER BY key');
      sendAuthJson(res,200,{config:result.rows});return true;
    }

    if(req.method==='PUT' && pathname.startsWith('/api/admin/config/')){
      const key=decodeURIComponent(pathname.slice('/api/admin/config/'.length));
      if(!/^[a-z][a-z0-9_.-]{1,79}$/.test(key)){sendAuthJson(res,400,{error:'Invalid configuration key.'});return true;}
      const body=await readJsonBody(req,12000);
      const value=body.value;
      if(value===undefined || JSON.stringify(value).length>10000){sendAuthJson(res,400,{error:'Provide a JSON configuration value up to 10 KB.'});return true;}
      const before=await pool.query('SELECT value_json FROM system_config WHERE key=$1',[key]);
      await pool.query(`INSERT INTO system_config(key,value_json,updated_by,updated_at) VALUES($1,$2::jsonb,$3,now())
        ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_by=EXCLUDED.updated_by,updated_at=now()`,[key,JSON.stringify(value),user.id]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'config.update','config',key,before.rows[0]?JSON.stringify(before.rows[0].value_json):null,JSON.stringify(value),JSON.stringify({key})]);
      sendAuthJson(res,200,{key,value});return true;
    }

    if(req.method==='GET' && pathname==='/api/admin/sessions'){
      const result=await pool.query(`SELECT s.id,s.user_id,u.email,u.display_name,s.created_at,s.last_seen_at,s.expires_at,s.ip,s.user_agent
        FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.revoked_at IS NULL AND s.expires_at>now()
        ORDER BY s.last_seen_at DESC LIMIT 500`);
      sendAuthJson(res,200,{sessions:result.rows});return true;
    }

    const revokeSession=pathname.match(/^\/api\/admin\/sessions\/([0-9a-f-]{36})$/i);
    if(req.method==='DELETE' && revokeSession){
      const beforeSession=await pool.query('SELECT id,user_id,created_at,last_seen_at,expires_at FROM sessions WHERE id=$1 AND revoked_at IS NULL LIMIT 1',[revokeSession[1]]);
      const result=await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id,user_id,revoked_at',[revokeSession[1]]);
      if(!result.rows[0]){sendAuthJson(res,404,{error:'Active session not found.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'session.revoke','session',revokeSession[1],beforeSession.rows[0]?JSON.stringify(beforeSession.rows[0]):null,
          JSON.stringify({id:result.rows[0].id,revokedAt:result.rows[0].revoked_at}),JSON.stringify({targetUserId:result.rows[0].user_id})]);
      sendAuthJson(res,200,{revoked:true,sessionId:revokeSession[1]});return true;
    }

    if(req.method==='GET' && pathname==='/api/admin/announcements'){
      const result=await pool.query('SELECT id,title,body,enabled,starts_at,expires_at,created_at,updated_at FROM announcements ORDER BY created_at DESC LIMIT 200');
      sendAuthJson(res,200,{announcements:result.rows});return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/announcements'){
      const body=await readJsonBody(req,12000);
      const title=typeof body.title==='string'?body.title.trim().slice(0,120):'';
      const message=typeof body.body==='string'?body.body.trim().slice(0,2000):'';
      if(!title||!message){sendAuthJson(res,400,{error:'Announcement title and body are required.'});return true;}
      const created=await pool.query(`INSERT INTO announcements(title,body,created_by) VALUES($1,$2,$3)
        RETURNING id,title,body,enabled,starts_at,expires_at,created_at`,[title,message,user.id]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'announcement.create','announcement',created.rows[0].id,null,JSON.stringify(created.rows[0]),JSON.stringify({title})]);
      sendAuthJson(res,201,{announcement:created.rows[0]});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/system-health') {
      const started = Date.now();
      await pool.query('SELECT 1');
      const databaseLatencyMs = Date.now() - started;
      await refreshDatabaseProviderAdapters(true);
      const providers = await Promise.all(getProviderRegistry().map(async (provider) => {
        const adapter = getProviderAdapter(provider.id); const before = Date.now();
        let configured=false,catalogReachable=false,modelCount=0,latencyMs:number|null=null;
        try {
          const config = await adapter?.validateConfig();
          configured=Boolean(config?.valid);
          if(configured&&adapter){
            const models=await adapter.listModels();
            catalogReachable=true;modelCount=models.length;latencyMs=Date.now()-before;
          }
        }catch{latencyMs=Date.now()-before;}
        const status=await pool.query(`SELECT last_health_at,last_health_ok FROM providers WHERE slug=$1 LIMIT 1`,[provider.id]).catch(()=>({rows:[] as any[]}));
        const fallback=await pool.query(`SELECT max(health_checked_at) AS last_health_at,
          bool_or(last_health_ok=true AND verified_at>now()-interval '24 hours' AND enabled=true) AS last_health_ok
          FROM model_catalog WHERE provider_key=$1`,[provider.id]).catch(()=>({rows:[] as any[]}));
        const lastHealthAt=status.rows[0]?.last_health_at||fallback.rows[0]?.last_health_at||null;
        const lastHealthOk=status.rows[0]?.last_health_ok??fallback.rows[0]?.last_health_ok??null;
        return {id:provider.id,configured,catalogReachable,healthy:lastHealthOk===true,
          lastHealthAt,lastHealthOk,modelCount,latencyMs};
      }));
      const migration=await pool.query('SELECT version,applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1').catch(()=>({rows:[] as any[]}));
      sendAuthJson(res, 200, {
        database: { healthy: true, latencyMs: databaseLatencyMs, lastMigration: migration.rows[0]?.version || null, migrationAppliedAt: migration.rows[0]?.applied_at || null },
        providers, queues: { configured: false, status: 'not_configured' },
        storage: { r2Configured: Boolean(process.env.R2_BUCKET), kvConfigured: Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID || process.env.KV_REST_API_URL) },
        app: { version: process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown' },
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/notifications/product-update') {
      const body = await readJsonBody(req, 12000);
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
      const message = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : '';
      if (!title || !message) {
        sendAuthJson(res, 400, { error: 'A title and message are required.' });
        return true;
      }
      const delivered = await pool.query(
        `INSERT INTO user_notification_events(user_id,event_type,title,body)
         SELECT u.id,'product.update',$1,$2
           FROM users u
           LEFT JOIN user_preferences p ON p.user_id=u.id
          WHERE u.status='active'
            AND COALESCE((p.notifications_json->>'productUpdates')::boolean,false)=true
            AND COALESCE((p.notifications_json->>'inApp')::boolean,true)=true
         RETURNING id`,
        [title, message],
      );
      await pool.query(
        'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'notification.product_update_broadcast','notification','product.update',null,
          JSON.stringify({title,recipientCount:delivered.rowCount||0}),JSON.stringify({title,recipientCount:delivered.rowCount||0})],
      );
      sendAuthJson(res, 200, { sent: true, recipientCount: delivered.rowCount || 0 });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/providers') {
      const registry = getProviderRegistry();
      const settings = await pool.query('SELECT provider_key, enabled, display_name FROM provider_configs');
      const byId = new Map(settings.rows.map((row) => [row.provider_key, row]));
      const providers = await Promise.all(registry.map(async (provider) => {
        const setting = byId.get(provider.id);
        const adapter = getProviderAdapter(provider.id);
        const config = await adapter?.validateConfig();
        return {
          id: provider.id,
          displayName: provider.displayName,
          enabled: setting ? Boolean(setting.enabled) : true,
          configured: Boolean(config?.valid),
          configMessage: config?.valid ? null : (config?.message || 'Provider configuration unavailable.'),
        };
      }));
      sendAuthJson(res, 200, { providers });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/models') {
      const descriptors = await getVerifiedModelDescriptors();
      const rows = await pool.query(`SELECT m.provider_key,m.model_key,m.display_name,m.description,m.enabled,m.context_window,
          COALESCE(m.capabilities_override,m.capabilities) AS capabilities,m.input_cost_per_million,m.output_cost_per_million,
          m.verified_at,m.last_health_ok,m.discovered_at,m.max_output,m.pricing_json
        FROM model_catalog m ORDER BY m.provider_key,m.display_name`);
      const descriptorMap = new Map(descriptors.map((model)=>[`${model.providerId}:${model.id}`,model]));
      sendAuthJson(res,200,{models:rows.rows.map((row)=>{
        const descriptor=descriptorMap.get(`${row.provider_key}:${row.model_key}`);
        const caps=Array.isArray(row.capabilities)?row.capabilities:[];
        return {
          id:row.model_key,providerId:row.provider_key,displayName:row.display_name,description:row.description||'',
          contextWindow:Number(row.context_window)||0,maxOutput:row.max_output||null,pricing:row.pricing_json||null,enabled:Boolean(row.enabled),
          verifiedAt:descriptor?.verifiedAt || (row.last_health_ok && row.verified_at && new Date(row.verified_at).getTime()>Date.now()-24*60*60*1000 ? row.verified_at : null),
          lastHealthOk:Boolean(row.last_health_ok),discoveredAt:row.discovered_at,
          capabilities:descriptor?.capabilities || Object.fromEntries(['text','streaming','vision','imageGen','imageEdit','ocr','tts','stt','tools','jsonMode'].map((key)=>[key,caps.includes(key)])),
          inputCostPerMillion:row.input_cost_per_million??null,outputCostPerMillion:row.output_cost_per_million??null,
        };
      })});return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/models/manual'){
      const body=await readJsonBody(req,8000);
      const parsed=manualModelInput.safeParse(body);
      if(!parsed.success){sendAuthJson(res,400,{error:'Provide a valid provider slug, exact model ID, and context window.'});return true;}
      const providerId=parsed.data.providerId;
      const modelId=parsed.data.modelId;
      const displayName=parsed.data.displayName||modelId;
      const contextWindow=parsed.data.contextWindow||0;
      const provider=await pool.query('SELECT id FROM providers WHERE slug=$1 LIMIT 1',[providerId]);
      const legacy=await pool.query('SELECT 1 FROM provider_configs WHERE provider_key=$1 LIMIT 1',[providerId]);
      if(!provider.rows[0]&&!legacy.rows[0]){sendAuthJson(res,404,{error:'Provider is not registered.'});return true;}
      const created=await pool.query(`INSERT INTO model_catalog(provider_key,model_key,display_name,description,capabilities,enabled,context_window,verified_at,last_health_ok,discovered_at)
        VALUES($1,$2,$3,'Manually registered; requires a successful model health check.',ARRAY['text','streaming'],false,$4,NULL,false,now())
        ON CONFLICT(provider_key,model_key) DO NOTHING RETURNING provider_key,model_key,display_name,enabled`,
        [providerId,modelId,displayName,contextWindow]);
      if(!created.rows[0]){sendAuthJson(res,409,{error:'This model is already registered.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'model.manual.create','model',providerId+':'+modelId,null,JSON.stringify(created.rows[0]),JSON.stringify({displayName,contextWindow})]);
      sendAuthJson(res,201,{model:created.rows[0],enabled:false,verifiedAt:null});return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/models/test'){
      const body=await readJsonBody(req,4000);
      const providerId=typeof body.providerId==='string'?body.providerId:'';
      const modelId=typeof body.modelId==='string'?body.modelId:'';
      await refreshDatabaseProviderAdapters(true);
      const adapter=getProviderAdapter(providerId);
      if(!adapter||!modelId){sendAuthJson(res,400,{error:'Provide a configured provider and model ID.'});return true;}
      const beforeHealth=await pool.query('SELECT enabled,verified_at,last_health_ok,health_checked_at FROM model_catalog WHERE provider_key=$1 AND model_key=$2 LIMIT 1',[providerId,modelId]);
      const started=Date.now();
      let healthy=false,checkedAt=new Date().toISOString();
      try{const result=await adapter.healthCheck(modelId);healthy=result.healthy;checkedAt=result.checkedAt;}catch{healthy=false;}
      await recordModelHealthResult(providerId,modelId,healthy,checkedAt);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'model.health_check','model',providerId+':'+modelId,
          beforeHealth.rows[0]?JSON.stringify(beforeHealth.rows[0]):null,
          JSON.stringify({lastHealthOk:healthy,verifiedAt:healthy?checkedAt:null,healthCheckedAt:checkedAt}),
          JSON.stringify({healthy,latencyMs:Date.now()-started})]);
      sendAuthJson(res,healthy?200:502,{providerId,modelId,healthy,verifiedAt:healthy?checkedAt:null,latencyMs:Date.now()-started});return true;
    }

    if(req.method==='DELETE' && pathname==='/api/admin/models'){
      const body=await readJsonBody(req,4000);
      const providerId=typeof body.providerId==='string'?body.providerId:'';
      const modelId=typeof body.modelId==='string'?body.modelId:'';
      if(!providerId||!modelId){sendAuthJson(res,400,{error:'Provider and model IDs are required.'});return true;}
      const deleted=await pool.query('DELETE FROM model_catalog WHERE provider_key=$1 AND model_key=$2 RETURNING *',[providerId,modelId]);
      if(!deleted.rows[0]){sendAuthJson(res,404,{error:'Model not found.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
        [user.id,user.role,'model.delete','model',providerId+':'+modelId,JSON.stringify(deleted.rows[0]),null,JSON.stringify({})]);
      sendAuthJson(res,200,{deleted:true,providerId,modelId});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/fallbacks') {
      const result = await pool.query('SELECT capability, ordered_models, updated_at FROM provider_fallback_chains ORDER BY capability');
      sendAuthJson(res, 200, { fallbacks: result.rows });
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/providers') {
      const body = await readJsonBody(req);
      const providerId = typeof body.providerId === 'string' ? body.providerId : '';
      const enabled = body.enabled;
      const provider = getProviderRegistry().find((item) => item.id === providerId);
      const catalogProvider = await pool.query('SELECT slug,display_name,enabled,kind FROM providers WHERE slug=$1 LIMIT 1',[providerId]);
      if ((!provider && !catalogProvider.rows[0]) || typeof enabled !== 'boolean') {
        sendAuthJson(res,400,{error:'A registered provider ID and boolean enabled value are required.'});return true;
      }
      const displayName=provider?.displayName || catalogProvider.rows[0].display_name;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const previousProvider=await client.query('SELECT slug,display_name,enabled,kind,base_url FROM providers WHERE slug=$1 LIMIT 1',[providerId]);
        await client.query('UPDATE providers SET enabled=$2,updated_at=now() WHERE slug=$1',[providerId,enabled]);
        await client.query(
          `INSERT INTO provider_configs (provider_key, display_name, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (provider_key) DO UPDATE SET enabled = EXCLUDED.enabled, display_name = EXCLUDED.display_name, updated_at = now()`,
          [providerId, displayName, enabled],
        );
        await client.query(
          'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'provider.toggle','provider',providerId,
            previousProvider.rows[0]?JSON.stringify(previousProvider.rows[0]):JSON.stringify({enabled:catalogProvider.rows[0]?.enabled??null}),
            JSON.stringify({slug:providerId,displayName,enabled}),JSON.stringify({enabled})],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { providerId, enabled });
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/models') {
      const body = await readJsonBody(req);
      const providerId = typeof body.providerId === 'string' ? body.providerId : '';
      const modelId = typeof body.modelId === 'string' ? body.modelId : '';
      const enabled = body.enabled;
      const inputCost = body.inputCostPerMillion;
      const outputCost = body.outputCostPerMillion;
      const capabilityNames = ['text','streaming','vision','imageGen','imageEdit','ocr','tts','stt','tools','jsonMode'];
      const capabilities = body.capabilities === undefined ? null : body.capabilities;
      if (capabilities !== null && (!Array.isArray(capabilities) || capabilities.some((item: unknown) => typeof item !== 'string' || !capabilityNames.includes(item)))) {
        sendAuthJson(res, 400, { error: 'Invalid model capability override.' }); return true;
      }
      const descriptor = (await getVerifiedModelDescriptors()).find((model) => model.providerId === providerId && model.id === modelId);
      const storedModel=await pool.query('SELECT display_name,context_window,capabilities,verified_at,last_health_ok,enabled,input_cost_per_million,output_cost_per_million,capabilities_override FROM model_catalog WHERE provider_key=$1 AND model_key=$2 LIMIT 1',[providerId,modelId]);
      if ((!descriptor&&!storedModel.rows[0]) || typeof enabled !== 'boolean') {
        sendAuthJson(res,400,{error:'Select a registered model and provide a boolean enabled value.'});return true;
      }
      const actualCapabilities=descriptor
        ? Object.entries(descriptor.capabilities).filter(([,enabled])=>enabled).map(([name])=>name)
        : (Array.isArray(storedModel.rows[0]?.capabilities)?storedModel.rows[0].capabilities as string[]:[]);
      if(capabilities!==null&&capabilities.some((name:string)=>!actualCapabilities.includes(name))){
        sendAuthJson(res,400,{error:'Capability overrides may disable provider capabilities, but cannot invent unsupported capabilities.'});return true;
      }
      const validCost = (value: unknown) => value === null || value === undefined ||
        (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000);
      if (!validCost(inputCost) || !validCost(outputCost)) {
        sendAuthJson(res, 400, { error: 'Model pricing must be a non-negative number or null.' });
        return true;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO model_catalog
            (provider_key, model_key, display_name, capabilities, capabilities_override, enabled, context_window, input_cost_per_million, output_cost_per_million, verified_at, last_health_ok, updated_at)
           VALUES ($1, $2, $3, $4, $11, $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (provider_key, model_key) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             capabilities = EXCLUDED.capabilities,
             capabilities_override = COALESCE(EXCLUDED.capabilities_override, model_catalog.capabilities_override),
             enabled = EXCLUDED.enabled,
             context_window = EXCLUDED.context_window,
             input_cost_per_million = EXCLUDED.input_cost_per_million,
             output_cost_per_million = EXCLUDED.output_cost_per_million,
             verified_at = EXCLUDED.verified_at,
             last_health_ok = EXCLUDED.last_health_ok,
             updated_at = now()`,
          [providerId, modelId, descriptor?.displayName || storedModel.rows[0].display_name,
            descriptor ? Object.entries(descriptor.capabilities).filter(([, value]) => value).map(([key]) => key) : storedModel.rows[0].capabilities,
            enabled, descriptor?.contextWindow ?? Number(storedModel.rows[0].context_window) ?? 0, inputCost ?? null, outputCost ?? null,
            descriptor?.verifiedAt ?? null, Boolean(descriptor?.verifiedAt), capabilities],
        );
        const updatedModel=await client.query('SELECT display_name,context_window,capabilities,enabled,verified_at,last_health_ok,input_cost_per_million,output_cost_per_million,capabilities_override FROM model_catalog WHERE provider_key=$1 AND model_key=$2',[providerId,modelId]);
        await client.query(
          'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'model.update','model',`${providerId}:${modelId}`,
            storedModel.rows[0]?JSON.stringify(storedModel.rows[0]):null,JSON.stringify(updatedModel.rows[0]),
            JSON.stringify({enabled,inputCostPerMillion:inputCost??null,outputCostPerMillion:outputCost??null})],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { providerId, modelId, enabled });
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/admin/fallbacks') {
      const body = await readJsonBody(req);
      const capability = typeof body.capability === 'string' ? body.capability : '';
      const orderedModels = body.orderedModels;
      if (!ALLOWED_FALLBACK_CAPABILITIES.has(capability) || !Array.isArray(orderedModels) ||
          orderedModels.length > 20 || orderedModels.some((item) => typeof item !== 'string' || item.length > 300)) {
        sendAuthJson(res, 400, { error: 'Invalid capability fallback chain.' });
        return true;
      }
      const uniqueModels = [...new Set(orderedModels as string[])];
      const capabilityFlag: Record<string, keyof import('../providers/providerTypes.ts').CapabilityFlags> = {
        text: 'text', vision: 'vision', imageGen: 'imageGen', tts: 'tts', stt: 'stt',
      };
      const discovered = await getVerifiedModelDescriptors();
      const allowed = new Set(discovered.filter((model) =>
        model.enabled && model.capabilities[capabilityFlag[capability]],
      ).map((model) => model.providerId + '::' + model.id));
      if (uniqueModels.some((modelId) => !allowed.has(modelId))) {
        sendAuthJson(res, 400, { error: 'Fallback entries must be enabled, discovered models with the selected capability. Use providerId::modelId.' });
        return true;
      }
      const previousFallback=await pool.query('SELECT capability,ordered_models FROM provider_fallback_chains WHERE capability=$1 LIMIT 1',[capability]);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO provider_fallback_chains (capability, ordered_models, updated_by)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (capability) DO UPDATE SET ordered_models = EXCLUDED.ordered_models, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [capability, JSON.stringify(uniqueModels), user.id],
        );
        await client.query(
          'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',
          [user.id,user.role,'fallback.update','capability',capability,
            previousFallback.rows[0]?JSON.stringify(previousFallback.rows[0]):null,
            JSON.stringify({capability,orderedModels:uniqueModels}),JSON.stringify({orderedModels:uniqueModels})],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { capability, orderedModels: uniqueModels });
      return true;
    }

    sendAuthJson(res, 404, { error: 'Admin route not found.' });
    return true;
  } catch {
    sendAuthJson(res, 500, { error: 'Admin operation failed. Check database schema and server logs.' });
    return true;
  }
}
