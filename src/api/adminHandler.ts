import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getProviderAdapter, getProviderRegistry, getVerifiedModelDescriptors, refreshCustomProviderRegistry } from '../services/providerGateway.ts';
import { encryptProviderConfig } from '../services/providerSecrets.ts';

const ALLOWED_FALLBACK_CAPABILITIES = new Set(['text', 'vision', 'imageGen', 'tts', 'stt']);

async function requireAdmin(req: IncomingMessage, res: ServerResponse) {
  const user = await authenticateRequest(req);
  if (!user) {
    sendAuthJson(res, 401, { error: 'Sign in is required.' });
    return null;
  }
  if (user.role !== 'admin') {
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
  if (!['GET', 'PATCH', 'POST'].includes(req.method || '')) {
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
  if (user.role !== 'admin') {
    sendAuthJson(res, 403, { error: 'Administrator access is required.' });
    return true;
  }
  if (req.method !== 'GET' && !verifyCsrf(req)) {
    sendAuthJson(res, 403, { error: 'CSRF validation failed.' });
    return true;
  }

  try {
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
      if (!targetId || (role !== undefined && !['user','admin'].includes(role)) ||
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
        const removingActiveAdmin = target.rows[0].role === 'admin' && target.rows[0].status === 'active' &&
          (nextRole !== 'admin' || nextStatus !== 'active');
        if (removingActiveAdmin) {
          const admins = await client.query("SELECT count(*)::int AS total FROM users WHERE role='admin' AND status='active'");
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

    if (req.method === 'POST' && pathname === '/api/admin/providers/custom') {
      const body = await readJsonBody(req, 16000);
      const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0,100) : '';
      const baseUrlText = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const apiFormat = body.apiFormat === undefined ? 'openai_chat_completions' : body.apiFormat;
      const authMethod = body.authMethod === undefined ? 'bearer' : body.authMethod;
      const authHeaderName = typeof body.authHeaderName === 'string' ? body.authHeaderName.trim() : 'api-key';
      const timeoutMs = body.timeoutMs === undefined ? 30000 : Number(body.timeoutMs);
      const priority = body.priority === undefined ? 100 : Number(body.priority);
      const enabled = body.enabled === true;
      let baseUrl: URL;
      try { baseUrl = new URL(baseUrlText); } catch { sendAuthJson(res, 400, { error: 'A valid provider base URL is required.' }); return true; }
      const localHttp = process.env.NODE_ENV !== 'production' && baseUrl.protocol === 'http:' &&
        ['localhost','127.0.0.1'].includes(baseUrl.hostname);
      if (!/^custom-[a-z0-9][a-z0-9-]{1,48}$/.test(providerId) || !displayName ||
          (baseUrl.protocol !== 'https:' && !localHttp) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash ||
          apiFormat !== 'openai_chat_completions' || !['bearer','api-key-header','none'].includes(authMethod) ||
          (authMethod !== 'none' && !apiKey) || apiKey.length > 4096 ||
          (authMethod === 'api-key-header' && !/^[A-Za-z0-9-]{1,80}$/.test(authHeaderName)) ||
          !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000 ||
          !Number.isInteger(priority) || priority < 0 || priority > 10000) {
        sendAuthJson(res, 400, { error: 'Invalid provider configuration. Only HTTPS OpenAI-compatible chat-completions endpoints are supported.' });
        return true;
      }
      const defaultHeaders = body.defaultHeaders === undefined ? {} : body.defaultHeaders;
      if (!defaultHeaders || typeof defaultHeaders !== 'object' || Array.isArray(defaultHeaders) ||
          Object.entries(defaultHeaders).length > 12 ||
          Object.entries(defaultHeaders).some(([key,value]) => !/^[A-Za-z0-9-]{1,80}$/.test(key) ||
            typeof value !== 'string' || value.length > 1000 || /[\\r\\n]/.test(value))) {
        sendAuthJson(res, 400, { error: 'Default headers must be a small object of safe header names and string values.' });
        return true;
      }
      let encrypted: string;
      try {
        encrypted = encryptProviderConfig({
          baseUrl: baseUrl.toString().replace(/\/+$/, ''),
          apiKey,
          authHeaderName,
          defaultHeaders,
        });
      } catch {
        sendAuthJson(res, 503, { error: 'Custom provider storage is unavailable. Configure AFG_PROVIDER_SECRET_ENCRYPTION_KEY as a base64-encoded 32-byte key.' });
        return true;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const saved = await client.query(
          `INSERT INTO providers(kind,display_name,config_encrypted,enabled,api_format,auth_method,priority,request_timeout_ms,streaming_supported,is_custom)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,true)
           ON CONFLICT(kind) DO NOTHING RETURNING kind,display_name,enabled`,
          [providerId,displayName,encrypted,enabled,apiFormat,authMethod,priority,timeoutMs],
        );
        if (!saved.rows[0]) {
          await client.query('ROLLBACK');
          sendAuthJson(res, 409, { error: 'That provider identifier is already reserved.' });
          return true;
        }
        await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'provider.custom.create','provider',providerId,JSON.stringify({displayName,apiFormat,authMethod,enabled,priority,timeoutMs})]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await refreshCustomProviderRegistry(true);
      const adapter = getProviderAdapter(providerId);
      const configStatus = await adapter?.validateConfig();
      sendAuthJson(res, 201, {
        provider: { id: providerId, displayName, enabled, configured: Boolean(configStatus?.valid), custom: true, credentialsStored: true },
        connectionTest: 'not_run',
        message: 'Provider configuration was encrypted and saved. Run the provider connection test to discover models.',
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/providers/test') {
      await refreshCustomProviderRegistry(true);
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
      await refreshCustomProviderRegistry(true);
      const registry = getProviderRegistry();
      const settings = await pool.query('SELECT provider_key, enabled, display_name FROM provider_configs');
      const customRows = await pool.query('SELECT kind,display_name,enabled,api_format,priority,streaming_supported FROM providers WHERE is_custom=true ORDER BY priority,display_name');
      const byId = new Map(settings.rows.map((row) => [row.provider_key, row]));
      const providers = await Promise.all(registry.map(async (provider) => {
        const setting = byId.get(provider.id);
        const adapter = getProviderAdapter(provider.id);
        const config = await adapter?.validateConfig();
        const custom = customRows.rows.find((row) => row.kind === provider.id);
        return {
          id: provider.id,
          displayName: provider.displayName,
          enabled: custom ? Boolean(custom.enabled) : (setting ? Boolean(setting.enabled) : true),
          configured: Boolean(config?.valid),
          configMessage: config?.valid ? null : (config?.message || 'Provider configuration unavailable.'),
          ...(custom ? { apiFormat: custom.api_format, priority: custom.priority, streamingSupported: custom.streaming_supported } : {}),
          custom: Boolean(custom),
          credentialsStored: Boolean(custom),
        };
      }));
      sendAuthJson(res, 200, { providers });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/models') {
      const descriptors = await getVerifiedModelDescriptors();
      const rows = await pool.query(
        `SELECT provider_key, model_key, enabled, input_cost_per_million, output_cost_per_million, capabilities_override
           FROM model_catalog`,
      );
      const settings = new Map(rows.rows.map((row) => [`${row.provider_key}:${row.model_key}`, row]));
      sendAuthJson(res, 200, {
        models: descriptors.map((model) => {
          const setting = settings.get(`${model.providerId}:${model.id}`);
          return {
            ...model,
            capabilities: setting?.capabilities_override ? Object.fromEntries(Object.keys(model.capabilities).map((key) => [key, setting.capabilities_override.includes(key)])) : model.capabilities,
            enabled: setting ? Boolean(setting.enabled) : model.enabled,
            inputCostPerMillion: setting?.input_cost_per_million ?? null,
            outputCostPerMillion: setting?.output_cost_per_million ?? null,
          };
        }),
      });
      return true;
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
      await refreshCustomProviderRegistry(true);
      const provider = getProviderRegistry().find((item) => item.id === providerId);
      if (!provider || typeof enabled !== 'boolean') {
        sendAuthJson(res, 400, { error: 'A registered provider ID and boolean enabled value are required.' });
        return true;
      }
      if (providerId.startsWith('custom-')) {
        const updated = await pool.query('UPDATE providers SET enabled=$2,updated_at=now() WHERE kind=$1 AND is_custom=true RETURNING kind,enabled', [providerId,enabled]);
        if (!updated.rows[0]) { sendAuthJson(res, 404, { error: 'Custom provider not found.' }); return true; }
        await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
          [user.id,'provider.toggle','provider',providerId,JSON.stringify({enabled,custom:true})]);
        await refreshCustomProviderRegistry(true);
        sendAuthJson(res, 200, { providerId, enabled, custom:true });
        return true;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
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
