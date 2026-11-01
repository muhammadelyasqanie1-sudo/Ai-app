import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getProviderAdapter, getProviderRegistry, getVerifiedModelDescriptors } from '../services/providerGateway.ts';

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
      const role = body.role;
      const status = body.status;
      if (!targetId || (role !== undefined && !['user','admin'].includes(role)) ||
          (status !== undefined && !['active','suspended'].includes(status)) ||
          (role === undefined && status === undefined)) {
        sendAuthJson(res, 400, { error: 'Provide a user ID and a valid role or status.' }); return true;
      }
      if (targetId === user.id && (role === 'user' || status === 'suspended')) {
        sendAuthJson(res, 400, { error: 'You cannot revoke your own administrator access or suspend your own account.' }); return true;
      }
      const result = await pool.query(`
        UPDATE users SET role=COALESCE($2,role),status=COALESCE($3,status),updated_at=now()
        WHERE id=$1 AND status <> 'deleted' RETURNING id,role,status`,
        [targetId, role ?? null, status ?? null]);
      if (!result.rowCount) { sendAuthJson(res, 404, { error: 'User not found.' }); return true; }
      if (status === 'suspended') await pool.query('DELETE FROM sessions WHERE user_id=$1', [targetId]);
      await pool.query(
        'INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'user.access.update','user',targetId,JSON.stringify({role:role ?? null,status:status ?? null})]);
      sendAuthJson(res, 200, { user: result.rows[0] }); return true;
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
      const scopeType = body.scopeType;
      const scopeKey = typeof body.scopeKey === 'string' ? body.scopeKey.trim().slice(0,180) : '';
      const requests = Number(body.requests), windowSeconds = Number(body.windowSeconds);
      const enabled = body.enabled !== false;
      if (!['user','tier','model'].includes(scopeType) || !scopeKey ||
          !Number.isInteger(requests) || requests < 1 || requests > 1000000 ||
          !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) {
        sendAuthJson(res, 400, { error: 'Invalid rate-limit policy.' }); return true;
      }
      const result = await pool.query(`INSERT INTO rate_limit_policies(scope_type,scope_key,requests,window_seconds,enabled,updated_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(scope_type,scope_key) DO UPDATE SET
        requests=EXCLUDED.requests,window_seconds=EXCLUDED.window_seconds,enabled=EXCLUDED.enabled,
        updated_by=EXCLUDED.updated_by,updated_at=now()
        RETURNING id,scope_type,scope_key,requests,window_seconds,enabled,updated_at`,
        [scopeType,scopeKey,requests,windowSeconds,enabled,user.id]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'rate_limit.update','rate_limit',scopeType+':'+scopeKey,JSON.stringify({requests,windowSeconds,enabled})]);
      sendAuthJson(res, 200, { policy: result.rows[0] }); return true;
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
      await pool.query(`INSERT INTO feature_flags(flag_key,enabled,description,updated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(flag_key) DO UPDATE SET enabled=EXCLUDED.enabled,description=EXCLUDED.description,
        updated_by=EXCLUDED.updated_by,updated_at=now()`,[body.key,body.enabled,description,user.id]);
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'feature_flag.update','feature_flag',body.key,JSON.stringify({enabled:body.enabled})]);
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
      const provider = getProviderRegistry().find((item) => item.id === providerId);
      if (!provider || typeof enabled !== 'boolean') {
        sendAuthJson(res, 400, { error: 'A registered provider ID and boolean enabled value are required.' });
        return true;
      }
      await pool.query(
        `INSERT INTO provider_configs (provider_key, display_name, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (provider_key) DO UPDATE SET enabled = EXCLUDED.enabled, display_name = EXCLUDED.display_name, updated_at = now()`,
        [provider.id, provider.displayName, enabled],
      );
      await pool.query(
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
        [user.id, 'provider.toggle', 'provider', provider.id, JSON.stringify({ enabled })],
      );
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
      await pool.query(
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
      await pool.query(
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
        [user.id, 'model.update', 'model', `${providerId}:${modelId}`, JSON.stringify({ enabled, inputCostPerMillion: inputCost ?? null, outputCostPerMillion: outputCost ?? null })],
      );
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
      await pool.query(
        `INSERT INTO provider_fallback_chains (capability, ordered_models, updated_by)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (capability) DO UPDATE SET ordered_models = EXCLUDED.ordered_models, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [capability, JSON.stringify(uniqueModels), user.id],
      );
      await pool.query(
        'INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
        [user.id, 'fallback.update', 'capability', capability, JSON.stringify({ orderedModels: uniqueModels })],
      );
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
