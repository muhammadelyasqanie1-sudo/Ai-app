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
        `SELECT provider_key, model_key, enabled, input_cost_per_million, output_cost_per_million
           FROM model_catalog`,
      );
      const settings = new Map(rows.rows.map((row) => [`${row.provider_key}:${row.model_key}`, row]));
      sendAuthJson(res, 200, {
        models: descriptors.map((model) => {
          const setting = settings.get(`${model.providerId}:${model.id}`);
          return {
            ...model,
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
          (provider_key, model_key, display_name, capabilities, enabled, context_window, input_cost_per_million, output_cost_per_million, verified_at, last_health_ok, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (provider_key, model_key) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           capabilities = EXCLUDED.capabilities,
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
          descriptor.verifiedAt, descriptor.verifiedAt !== null],
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
