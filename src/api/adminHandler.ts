import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getProviderAdapter, getProviderRegistry, getVerifiedModelDescriptors, refreshDatabaseProviderAdapters } from '../services/providerGateway.ts';
import { encryptProviderSecret, providerKeyHint } from '../security/providerVault.ts';

const ALLOWED_FALLBACK_CAPABILITIES = new Set(['text', 'vision', 'imageGen', 'tts', 'stt']);

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

    const keyRoute = pathname.match(/^\\/api\\/admin\\/providers\\/([a-z0-9-]+)\\/keys(?:\\/rotate)?$/);
    if (keyRoute && ((req.method==='PUT' && !pathname.endsWith('/rotate')) || (req.method==='POST' && pathname.endsWith('/rotate'))) {
      if (user.role !== 'superadmin') { sendAuthJson(res,403,{error:'Superadmin access is required to manage provider keys.'}); return true; }
      const providerSlug=keyRoute[1];
      const body=await readJsonBody(req,10000);
      const secret=typeof body.apiKey==='string' ? body.apiKey.trim() : '';
      const alias=typeof body.alias==='string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.alias) ? body.alias : 'default';
      if(secret.length<8 || secret.length>8192){sendAuthJson(res,400,{error:'A provider API key between 8 and 8192 characters is required.'});return true;}
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
          await client.query(`INSERT INTO model_catalog(provider_key,model_key,display_name,description,capabilities,enabled,context_window,discovered_at,last_health_ok,verified_at)
            VALUES($1,$2,$3,$4,$5,false,$6,now(),false,NULL)
            ON CONFLICT(provider_key,model_key) DO UPDATE SET display_name=EXCLUDED.display_name,
              description=EXCLUDED.description,capabilities=EXCLUDED.capabilities,context_window=EXCLUDED.context_window,
              discovered_at=now(),updated_at=now()`,
            [providerId,model.id,model.displayName,model.description,
              Object.entries(model.capabilities).filter(([,enabled])=>enabled).map(([name])=>name),model.contextWindow]);
        }
        await client.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
          [user.id,user.role,'provider.models.discover','provider',providerId,JSON.stringify({discovered:discovered.length})]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      sendAuthJson(res,200,{providerId,discovered:discovered.length,enabledByDefault:false});return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/subscription-plans') {
    if (req.method === 'GET' && pathname === '/api/admin/providers') {
      const result = await pool.query(`SELECT id,slug,kind,display_name,base_url,enabled,config_json,
          last_health_at,last_health_ok,last_error_code,source,created_at,updated_at
        FROM providers ORDER BY source,display_name`);
      sendAuthJson(res, 200, { providers: result.rows }); return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/providers/custom') {
      const body = await readJsonBody(req, 8000);
      const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      const protocol = body.protocol === 'anthropic-messages' ? 'anthropic-messages' : 'openai-compatible';
      let parsedUrl: URL | null = null;
      try { parsedUrl = new URL(baseUrl); } catch { parsedUrl = null; }
      if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug) || !displayName || displayName.length > 80 ||
          !parsedUrl || !['https:','http:'].includes(parsedUrl.protocol) ||
          (parsedUrl.protocol === 'http:' && !['localhost','127.0.0.1'].includes(parsedUrl.hostname))) {
        sendAuthJson(res, 400, { error: 'Provide a valid slug, display name, and HTTPS base URL (HTTP is allowed only for localhost).' }); return true;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await client.query(`INSERT INTO providers(kind,display_name,enabled,slug,base_url,config_json,source)
          VALUES('custom',$1,false,$2,$3,$4::jsonb,'custom')
          RETURNING id,slug,kind,display_name,base_url,enabled,config_json,source,created_at`,
          [displayName,slug,baseUrl,JSON.stringify({protocol,requires_key:true,custom:true})]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'provider.custom.create','provider',created.rows[0].id,JSON.stringify({slug,displayName,baseUrl,protocol})]);
        await client.query('COMMIT');
        sendAuthJson(res, 201, { provider: created.rows[0] }); return true;
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string })?.code === '23505') {
          sendAuthJson(res, 409, { error: 'A provider with this slug already exists.' }); return true;
        }
        throw error;
      } finally { client.release(); }
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
          (status !== undefined && !['active','suspended'].includes(status)) ||
          (role === undefined && status === undefined)) {
        sendAuthJson(res, 400, { error: 'Provide a user ID and a valid role or status.' }); return true;
      }
      if (targetId === user.id && (role === 'user' || status === 'suspended')) {
        sendAuthJson(res, 400, { error: 'You cannot revoke your own administrator access or suspend your own account.' }); return true;
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
        const removingActiveAdmin = ['admin','superadmin'].includes(target.rows[0].role) && target.rows[0].status === 'active' &&
          (!['admin','superadmin'].includes(nextRole) || nextStatus !== 'active');
        if (removingActiveAdmin) {
          const admins = await client.query("SELECT count(*)::int AS total FROM users WHERE role IN ('admin','superadmin') AND status='active'");
          if (Number(admins.rows[0]?.total || 0) <= 1) {
            await client.query('ROLLBACK');
            sendAuthJson(res, 409, { error: 'At least one active administrator must remain.' }); return true;
          }
        }
        const result = await client.query(`
          UPDATE users SET role=COALESCE($2,role),status=COALESCE($3,status),updated_at=now()
          WHERE id=$1 AND status <> 'deleted' RETURNING id,role,status`,
          [targetId, role ?? null, status ?? null]);
        updatedUser = result.rows[0];
        if (status === 'suspended' || role !== undefined) {
          await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[targetId]);
        }
        await client.query(
          'INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'user.access.update','user',targetId,JSON.stringify({role:role ?? null,status:status ?? null})],
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

    if (req.method === 'POST' && pathname === '/api/admin/providers/test') {
      const body = await readJsonBody(req, 4000);
      const provider = getProviderRegistry().find((item) => item.id === body.providerId);
      if (!provider) { sendAuthJson(res, 400, { error: 'Unknown provider.' }); return true; }
      const adapter = getProviderAdapter(provider.id);
      const started = Date.now();
      let configured = false, connected = false, discoveredModels = 0;
      try {
        const config = await adapter?.validateConfig();
        configured = Boolean(config?.valid);
        if (configured) { const models = await adapter!.listModels(); discoveredModels = models.length; connected = true; }
      } catch { connected = false; }
      const latencyMs = Date.now() - started;
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'provider.connection_test','provider',provider.id,JSON.stringify({configured,connected,discoveredModels,latencyMs})]);
      sendAuthJson(res, connected ? 200 : 502, { providerId: provider.id, configured, connected, discoveredModels, latencyMs,
        message: connected ? 'Provider connection succeeded.' : (configured ? 'Provider connection failed.' : 'Provider credentials are not configured.') });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/models/discover') {
      const models = await getVerifiedModelDescriptors();
      sendAuthJson(res, 200, { discovered: models.length, healthy: models.filter((model) => model.verifiedAt).length });
      return true;
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
          m.verified_at,m.last_health_ok,m.discovered_at
        FROM model_catalog m ORDER BY m.provider_key,m.display_name`);
      const descriptorMap = new Map(descriptors.map((model)=>[`${model.providerId}:${model.id}`,model]));
      sendAuthJson(res,200,{models:rows.rows.map((row)=>{
        const descriptor=descriptorMap.get(`${row.provider_key}:${row.model_key}`);
        const caps=Array.isArray(row.capabilities)?row.capabilities:[];
        return {
          id:row.model_key,providerId:row.provider_key,displayName:row.display_name,description:row.description||'',
          contextWindow:Number(row.context_window)||0,enabled:Boolean(row.enabled),
          verifiedAt:descriptor?.verifiedAt || (row.last_health_ok ? row.verified_at : null),
          lastHealthOk:Boolean(row.last_health_ok),discoveredAt:row.discovered_at,
          capabilities:descriptor?.capabilities || Object.fromEntries(['text','streaming','vision','imageGen','imageEdit','ocr','tts','stt','tools','jsonMode'].map((key)=>[key,caps.includes(key)])),
          inputCostPerMillion:row.input_cost_per_million??null,outputCostPerMillion:row.output_cost_per_million??null,
        };
      })});return true;
    }

    if(req.method==='POST' && pathname==='/api/admin/models/manual'){
      const body=await readJsonBody(req,8000);
      const providerId=typeof body.providerId==='string'?body.providerId.trim().toLowerCase():'';
      const modelId=typeof body.modelId==='string'?body.modelId.trim():'';
      const displayName=typeof body.displayName==='string'&&body.displayName.trim()?body.displayName.trim().slice(0,160):modelId;
      const contextWindow=Number(body.contextWindow||0);
      if(!/^[a-z0-9][a-z0-9-]{1,47}$/.test(providerId)||!modelId||modelId.length>300||
        !/^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/.test(modelId)||!Number.isInteger(contextWindow)||contextWindow<0||contextWindow>10000000){
        sendAuthJson(res,400,{error:'Provide a valid provider slug, exact model ID, and context window.'});return true;
      }
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
      if (!provider || typeof enabled !== 'boolean') {
        sendAuthJson(res, 400, { error: 'A registered provider ID and boolean enabled value are required.' });
        return true;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE providers SET enabled=$2,updated_at=now() WHERE slug=$1',[provider.id,enabled]);
        await client.query(
          `INSERT INTO provider_configs (provider_key, display_name, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (provider_key) DO UPDATE SET enabled = EXCLUDED.enabled, display_name = EXCLUDED.display_name, updated_at = now()`,
          [provider.id, provider.displayName, enabled],
        );
        await client.query(
          'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
          [user.id, 'provider.toggle', 'provider', provider.id, JSON.stringify({ enabled })],
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
      if (!descriptor || typeof enabled !== 'boolean') {
        sendAuthJson(res, 400, { error: 'Select a discovered model and provide a boolean enabled value.' });
        return true;
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
          [providerId, modelId, descriptor.displayName,
            Object.entries(descriptor.capabilities).filter(([, value]) => value).map(([key]) => key),
            enabled, descriptor.contextWindow, inputCost ?? null, outputCost ?? null,
            descriptor.verifiedAt, descriptor.verifiedAt !== null, capabilities],
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
