import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { z } from 'zod';
import { isIP } from 'node:net';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getProviderAdapter, getProviderRegistry, getVerifiedModelDescriptors, refreshDatabaseProviderAdapters } from '../services/providerGateway.ts';
import { encryptProviderSecret, providerKeyHint } from '../security/providerVault.ts';

const ALLOWED_FALLBACK_CAPABILITIES = new Set(['text', 'vision', 'imageGen', 'tts', 'stt']);
const customProviderInput = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(48).regex(/^[a-z0-9][a-z0-9-]+$/),
  displayName: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().url().max(500),
  protocol: z.literal('openai-compatible').optional(),
}).strict();
const providerKeyInput = z.object({
  apiKey: z.string().trim().min(8).max(8192),
  alias: z.literal('default').optional(),
}).strict();
const manualModelInput = z.object({
  providerId: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,47}$/),
  modelId: z.string().trim().min(1).max(300).regex(/^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/),
  displayName: z.string().trim().max(160).optional(),
  contextWindow: z.number().int().min(0).max(10_000_000).optional(),
}).strict();
function safeCustomProviderUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (parsed.username || parsed.password || parsed.hash || host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') || isIP(host)) return false;
    return parsed.protocol === 'https:';
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
      const result = await pool.query(`SELECT p.id,p.slug,p.kind,p.display_name,p.base_url,p.enabled,p.config_json,
          p.last_health_at,p.last_health_ok,p.last_error_code,p.source,p.created_at,p.updated_at,
          EXISTS(SELECT 1 FROM provider_keys k WHERE k.provider_id=p.id AND k.status='active') AS has_key,
          (SELECT k.key_hint FROM provider_keys k WHERE k.provider_id=p.id AND k.alias='default' AND k.status='active' LIMIT 1) AS key_hint,
          (SELECT k.status FROM provider_keys k WHERE k.provider_id=p.id AND k.alias='default' ORDER BY k.created_at DESC LIMIT 1) AS key_status
        FROM providers p ORDER BY p.source,p.display_name`);
      sendAuthJson(res,200,{providers:result.rows.map((row)=>({
        ...row,id:row.slug,displayName:row.display_name,
        configured: row.kind==='cloudflare' ? Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN)
          : row.kind==='ollama' ? false : Boolean(row.has_key),
        keyHint:user.role==='superadmin' ? row.key_hint : null,
        keyStatus:row.key_status,
      }))}); return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/providers/custom'){
      const body=await readJsonBody(req,8000);
      const parsed=customProviderInput.safeParse(body);
      if(!parsed.success||!safeCustomProviderUrl(parsed.data.baseUrl)){
        sendAuthJson(res,400,{error:'Provide a valid slug, display name, and public HTTPS OpenAI-compatible API base URL.'});return true;
      }
      const {slug,displayName,baseUrl}=parsed.data;
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const created=await client.query(`INSERT INTO providers(kind,display_name,enabled,slug,base_url,config_json,source)
          VALUES('custom',$1,false,$2,$3,$4::jsonb,'custom')
          RETURNING id,slug,kind,display_name,base_url,enabled,config_json,source,created_at`,
          [displayName,slug,baseUrl,JSON.stringify({protocol:'openai-compatible',requires_key:true,custom:true})]);
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
          [user.id,user.role,'provider.custom.create','provider',created.rows[0].id,JSON.stringify({slug,displayName,baseUrl,protocol:'openai-compatible'})]);
        await client.query('COMMIT');
        sendAuthJson(res,201,{provider:created.rows[0]});return true;
      }catch(error){
        await client.query('ROLLBACK');
        if((error as {code?:string})?.code==='23505'){sendAuthJson(res,409,{error:'A provider with this slug already exists.'});return true;}
        throw error;
      }finally{client.release();}
    }



    const keyRoute = pathname.match(/^\\/api\\/admin\\/providers\\/([a-z0-9-]+)\\/keys(?:\\/rotate)?$/);
    if (keyRoute && ((req.method==='PUT' && !pathname.endsWith('/rotate')) || (req.method==='POST' && pathname.endsWith('/rotate'))) {
      if (user.role !== 'superadmin') { sendAuthJson(res,403,{error:'Superadmin access is required to manage provider keys.'}); return true; }
      const providerSlug=keyRoute[1];
      const body=await readJsonBody(req,10000);
      const parsedKey=providerKeyInput.safeParse(body);
      if(!parsedKey.success){sendAuthJson(res,400,{error:'Provide a valid provider API key. Only the default key alias is currently supported.'});return true;}
      const secret=parsedKey.data.apiKey;
      const alias='default';
      const provider=await pool.query('SELECT id,slug FROM providers WHERE slug=$1 LIMIT 1',[providerSlug]);
      if(!provider.rows[0]){sendAuthJson(res,404,{error:'Provider not found.'});return true;}
      let encrypted:string;
      try{encrypted=encryptProviderSecret(secret);}catch{
        sendAuthJson(res,503,{error:'Provider key vault is not configured. Set PROVIDER_KEYS_MASTER_KEY to a 32-byte base64 or 64-character hex key.'});return true;
      }
      const hint=providerKeyHint(secret);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query(`INSERT INTO provider_keys(provider_id,alias,key_encrypted,key_hint,status,rotated_at)
          VALUES($1,$2,$3,$4,'active',CASE WHEN $5 THEN now() ELSE NULL END)
          ON CONFLICT(provider_id,alias) DO UPDATE SET key_encrypted=EXCLUDED.key_encrypted,key_hint=EXCLUDED.key_hint,status='active',rotated_at=now()`,
          [provider.rows[0].id,alias,encrypted,hint,pathname.endsWith('/rotate')]);
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
          [user.id,user.role,pathname.endsWith('/rotate')?'provider.key.rotate':'provider.key.set','provider',providerSlug,JSON.stringify({alias,keyHint:hint})]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      await refreshDatabaseProviderAdapters(true);
      sendAuthJson(res,200,{providerId:providerSlug,alias,keyHint:hint,status:'active'});return true;
    }

    const discoverRoute=pathname.match(/^\\/api\\/admin\\/providers\\/([a-z0-9-]+)\\/discover-models$/);
    if(req.method==='POST' && discoverRoute){
      const providerId=discoverRoute[1];
      await refreshDatabaseProviderAdapters(true);
      const adapter=getProviderAdapter(providerId);
      if(!adapter){sendAuthJson(res,404,{error:'Provider adapter is not implemented or is not configured.'});return true;}
      const config=await adapter.validateConfig();
      if(!config.valid){sendAuthJson(res,409,{error:'Provider credentials are not configured.'});return true;}
      const discovered=await adapter.listModels();
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
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
          [user.id,user.role,'provider.models.discover','provider',providerId,JSON.stringify({discovered:discovered.length})]);
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
        if (status === 'suspended' || role !== undefined) {
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

    const userDetailRoute=pathname.match(/^\\/api\\/admin\\/users\\/([0-9a-f-]{36})$/i);
    if(req.method==='GET'&&userDetailRoute){
      const targetId=userDetailRoute[1];
      const [profile,usage,conversations]=await Promise.all([
        pool.query(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,u.deleted_at,
          (SELECT max(last_seen_at) FROM sessions WHERE user_id=u.id) AS last_login
          FROM users u WHERE u.id=$1 LIMIT 1`,[targetId]),
        pool.query(`SELECT COALESCE(sum(tokens_in),0)::bigint AS input_tokens,COALESCE(sum(tokens_out),0)::bigint AS output_tokens,
          COALESCE(sum(cost_usd),0)::numeric(18,6) AS total_cost,count(*)::int AS request_count
          FROM usage_records WHERE user_id=$1`,[targetId]),
        pool.query('SELECT count(*)::int AS total FROM conversations WHERE user_id=$1',[targetId]),
      ]);
      if(!profile.rows[0]){sendAuthJson(res,404,{error:'User not found.'});return true;}
      sendAuthJson(res,200,{user:{...profile.rows[0],usage:usage.rows[0],conversationCount:conversations.rows[0]?.total||0}});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const [usage,requests,users,storage] = await Promise.all([
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
          (SELECT count(*)::bigint FROM conversations) AS conversations`)
      ]);
      sendAuthJson(res, 200, {
        usage: usage.rows, requests: requests.rows[0], users: users.rows[0],
        storage: { ...storage.rows[0], r2Configured: Boolean(process.env.R2_BUCKET && (process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID)), kvConfigured: Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID || process.env.KV_REST_API_URL) }
      }); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/requests') {
      const result = await pool.query(`SELECT request_id,method,route,status_code,duration_ms,classification,created_at
        FROM admin_request_events ORDER BY created_at DESC LIMIT 150`);
      sendAuthJson(res, 200, { requests: result.rows }); return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/audit') {
      const result = await pool.query(`SELECT a.id,a.actor_user_id,u.email AS actor_email,a.action,
        a.target_type,a.target_id,a.metadata,a.created_at FROM audit_logs a
        LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 250`);
      sendAuthJson(res, 200, { events: result.rows }); return true;
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
        const result = await client.query(`INSERT INTO rate_limit_policies(scope_type,scope_key,requests,window_seconds,enabled,updated_by)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(scope_type,scope_key) DO UPDATE SET
          requests=EXCLUDED.requests,window_seconds=EXCLUDED.window_seconds,enabled=EXCLUDED.enabled,
          updated_by=EXCLUDED.updated_by,updated_at=now()
          RETURNING id,scope_type,scope_key,requests,window_seconds,enabled,updated_at`,
          [scopeType,scopeKey,requests,windowSeconds,enabled,user.id]);
        policy = result.rows[0];
        await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'rate_limit.update','rate_limit',scopeType+':'+scopeKey,JSON.stringify({requests,windowSeconds,enabled})]);
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO feature_flags(flag_key,enabled,description,updated_by) VALUES($1,$2,$3,$4)
          ON CONFLICT(flag_key) DO UPDATE SET enabled=EXCLUDED.enabled,description=EXCLUDED.description,
          updated_by=EXCLUDED.updated_by,updated_at=now()`,[body.key,body.enabled,description,user.id]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'feature_flag.update','feature_flag',body.key,JSON.stringify({enabled:body.enabled})]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendAuthJson(res, 200, { key: body.key, enabled: body.enabled }); return true;
    }

    if (req.method === 'POST' && (pathname === '/api/admin/providers/test' || /^\\/api\\/admin\\/providers\\/[a-z0-9-]+\\/test$/.test(pathname))) {
      const body = await readJsonBody(req,4000);
      const routeId=pathname.match(/^\\/api\\/admin\\/providers\\/([a-z0-9-]+)\\/test$/)?.[1];
      const providerId=routeId || (typeof body.providerId==='string'?body.providerId:'');
      if(!providerId){sendAuthJson(res,400,{error:'Provider ID is required.'});return true;}
      await refreshDatabaseProviderAdapters(true);
      const providerRow=await pool.query('SELECT slug,display_name,enabled,kind FROM providers WHERE slug=$1 LIMIT 1',[providerId]);
      const adapter=getProviderAdapter(providerId);
      if(!providerRow.rows[0]&&!adapter){sendAuthJson(res,404,{error:'Provider not found.'});return true;}
      const started=Date.now();let configured=false,connected=false,discoveredModels=0,probeModel:string|null=null;
      try{
        const config=await adapter?.validateConfig();configured=Boolean(config?.valid);
        if(configured&&adapter){
          const models=await adapter.listModels();discoveredModels=models.length;
          probeModel=models[0]?.id||null;
          if(probeModel){const probe=await adapter.healthCheck(probeModel);connected=probe.healthy;}
          else connected=false;
        }
      }catch{connected=false;}
      const latencyMs=Date.now()-started;
      if(providerRow.rows[0])await pool.query('UPDATE providers SET last_health_at=now(),last_health_ok=$2,last_error_code=$3,updated_at=now() WHERE slug=$1',
        [providerId,connected,connected?null:(configured?'provider_probe_failed':'credentials_missing')]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'provider.connection_test','provider',providerId,JSON.stringify({configured,connected,discoveredModels,probeModel,latencyMs})]);
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
          count(*)::int AS requests,count(*) FILTER(WHERE status<>'success')::int AS errors
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
      const csvCell=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""').replace(/[\\r\\n]+/g,' ').slice(0,2000)+'"';
      const header=['request_id','error_code','error_class','message_redacted','metadata_json','created_at'];
      const lines=[header.join(','),...result.rows.map((row)=>header.map((key)=>csvCell(key==='metadata_json'?JSON.stringify(row[key]):row[key])).join(','))];
      res.statusCode=200;res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="afg-ai-errors.csv"');res.setHeader('Cache-Control','no-store');res.end(lines.join('\\n'));return true;
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
      await pool.query(`INSERT INTO system_config(key,value_json,updated_at) VALUES($1,$2::jsonb,now())
        ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=now()`,[key,JSON.stringify(value)]);
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

    const revokeSession=pathname.match(/^\\/api\\/admin\\/sessions\\/([0-9a-f-]{36})$/i);
    if(req.method==='DELETE' && revokeSession){
      const result=await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id,user_id',[revokeSession[1]]);
      if(!result.rows[0]){sendAuthJson(res,404,{error:'Active session not found.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'session.revoke','session',revokeSession[1],JSON.stringify({targetUserId:result.rows[0].user_id})]);
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
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'announcement.create','announcement',created.rows[0].id,JSON.stringify({title})]);
      sendAuthJson(res,201,{announcement:created.rows[0]});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/system-health') {
      const started = Date.now();
      await pool.query('SELECT 1');
      const databaseLatencyMs = Date.now() - started;
      const providers = await Promise.all(getProviderRegistry().map(async (provider) => {
        const adapter = getProviderAdapter(provider.id); const before = Date.now();
        try {
          const config = await adapter?.validateConfig();
          if (!config?.valid) return { id: provider.id, configured: false, healthy: false, latencyMs: null };
          const models = await adapter!.listModels();
          return { id: provider.id, configured: true, healthy: true, modelCount: models.length, latencyMs: Date.now()-before };
        } catch { return { id: provider.id, configured: true, healthy: false, latencyMs: Date.now()-before }; }
      }));
      sendAuthJson(res, 200, { database: { healthy: true, latencyMs: databaseLatencyMs },
        providers, queues: { configured: false, status: 'not_configured' },
        storage: { r2Configured: Boolean(process.env.R2_BUCKET), kvConfigured: Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID || process.env.KV_REST_API_URL) } });
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
        'INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'notification.product_update_broadcast','notification','product.update',JSON.stringify({title,recipientCount:delivered.rowCount||0})],
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
          verifiedAt:descriptor?.verifiedAt || (row.last_health_ok ? row.verified_at : null),
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
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'model.manual.create','model',providerId+':'+modelId,JSON.stringify({displayName,contextWindow})]);
      sendAuthJson(res,201,{model:created.rows[0],enabled:false,verifiedAt:null});return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/models/test'){
      const body=await readJsonBody(req,4000);
      const providerId=typeof body.providerId==='string'?body.providerId:'';
      const modelId=typeof body.modelId==='string'?body.modelId:'';
      await refreshDatabaseProviderAdapters(true);
      const adapter=getProviderAdapter(providerId);
      if(!adapter||!modelId){sendAuthJson(res,400,{error:'Provide a configured provider and model ID.'});return true;}
      const started=Date.now();
      let healthy=false,checkedAt=new Date().toISOString();
      try{const result=await adapter.healthCheck(modelId);healthy=result.healthy;checkedAt=result.checkedAt;}catch{healthy=false;}
      await pool.query(`UPDATE model_catalog SET last_health_ok=$3,verified_at=CASE WHEN $3 THEN $4::timestamptz ELSE NULL END,
          health_checked_at=$4::timestamptz,updated_at=now() WHERE provider_key=$1 AND model_key=$2`,
        [providerId,modelId,healthy,checkedAt]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'model.health_check','model',providerId+':'+modelId,JSON.stringify({healthy,latencyMs:Date.now()-started})]);
      sendAuthJson(res,healthy?200:502,{providerId,modelId,healthy,verifiedAt:healthy?checkedAt:null,latencyMs:Date.now()-started});return true;
    }

    if(req.method==='DELETE' && pathname==='/api/admin/models'){
      const body=await readJsonBody(req,4000);
      const providerId=typeof body.providerId==='string'?body.providerId:'';
      const modelId=typeof body.modelId==='string'?body.modelId:'';
      if(!providerId||!modelId){sendAuthJson(res,400,{error:'Provider and model IDs are required.'});return true;}
      const deleted=await pool.query('DELETE FROM model_catalog WHERE provider_key=$1 AND model_key=$2 RETURNING model_key',[providerId,modelId]);
      if(!deleted.rows[0]){sendAuthJson(res,404,{error:'Model not found.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'model.delete','model',providerId+':'+modelId,JSON.stringify({})]);
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
      const catalogProvider = await pool.query('SELECT slug,display_name FROM providers WHERE slug=$1 LIMIT 1',[providerId]);
      if ((!provider && !catalogProvider.rows[0]) || typeof enabled !== 'boolean') {
        sendAuthJson(res,400,{error:'A registered provider ID and boolean enabled value are required.'});return true;
      }
      const displayName=provider?.displayName || catalogProvider.rows[0].display_name;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE providers SET enabled=$2,updated_at=now() WHERE slug=$1',[providerId,enabled]);
        await client.query(
          `INSERT INTO provider_configs (provider_key, display_name, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (provider_key) DO UPDATE SET enabled = EXCLUDED.enabled, display_name = EXCLUDED.display_name, updated_at = now()`,
          [providerId, displayName, enabled],
        );
        await client.query(
          'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
          [user.id, 'provider.toggle', 'provider', providerId, JSON.stringify({ enabled })],
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
      const storedModel=await pool.query('SELECT display_name,context_window,capabilities,verified_at,last_health_ok FROM model_catalog WHERE provider_key=$1 AND model_key=$2 LIMIT 1',[providerId,modelId]);
      if ((!descriptor&&!storedModel.rows[0]) || typeof enabled !== 'boolean') {
        sendAuthJson(res,400,{error:'Select a registered model and provide a boolean enabled value.'});return true;
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
        await client.query(
          'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
          [user.id, 'model.update', 'model', `${providerId}:${modelId}`, JSON.stringify({ enabled, inputCostPerMillion: inputCost ?? null, outputCostPerMillion: outputCost ?? null })],
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
          'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
          [user.id, 'fallback.update', 'capability', capability, JSON.stringify({ orderedModels: uniqueModels })],
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
