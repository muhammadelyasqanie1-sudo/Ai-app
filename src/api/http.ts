import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { handleChatApi } from './chatHandler.ts';
import { checkDatabase, pool } from './database.ts';
import { getProviderModelCatalog } from './modelCatalog.ts';
import { getCapabilitySnapshot, getImageStudioSnapshot, getFileAssistantSnapshot } from '../services/providerGateway.ts';
import { authenticateRequest, handleAuthApi } from './auth.ts';
import { handleAdminApi } from './adminHandler.ts';
import { handleResearchApi } from './research.ts';
import { handleVoiceApi } from './voice.ts';
import { handleProductivityApi } from './productivity.ts';
import { handleAccountApi } from './account.ts';

type ApiRequest = IncomingMessage & { originalUrl?: string };

function corsHeaders(req: IncomingMessage) {
  const origin = req.headers.origin;
  const configured = (process.env.APP_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = new Set([...configured, 'http://localhost:3000', 'http://localhost:5173', 'https://localhost', 'capacitor://localhost']);
  return origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown, requestId: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.end(JSON.stringify({ ...(body as Record<string, unknown>), requestId }));
}

async function enforceAdminConfiguredRateLimits(req: IncomingMessage, res: ServerResponse, pathname: string, requestId: string): Promise<boolean> {
  if (!pool || !pathname.startsWith('/api/') || ['/api/health','/api/ready'].includes(pathname)) return false;
  let account: Awaited<ReturnType<typeof authenticateRequest>> = null;
  try { account = await authenticateRequest(req); } catch { return false; }
  if (!account) return false;
  const policies = await pool.query(
    `SELECT scope_type,scope_key,requests,window_seconds FROM rate_limit_policies
      WHERE enabled=true AND ((scope_type='user' AND scope_key=$1) OR (scope_type='tier' AND scope_key=$2))
      ORDER BY CASE WHEN scope_type='user' THEN 0 ELSE 1 END`,
    [account.id, account.role],
  );
  for (const policy of policies.rows) {
    const counter = await pool.query(
      `INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
       VALUES($1,$2,to_timestamp(floor(extract(epoch FROM now())/$3)*$3),1)
       ON CONFLICT(scope_type,scope_key,window_start)
       DO UPDATE SET request_count=rate_limit_counters.request_count+1
       RETURNING request_count`,
      [policy.scope_type,policy.scope_key,policy.window_seconds],
    );
    if (Number(counter.rows[0]?.request_count || 0) > Number(policy.requests)) {
      res.setHeader('Retry-After', String(policy.window_seconds));
      sendJson(res, 429, { error: 'Rate limit exceeded.', scope: policy.scope_type }, requestId);
      return true;
    }
  }
  const modelId = typeof req.headers['x-afg-model'] === 'string' ? req.headers['x-afg-model'] : '';
  if (modelId) {
    const modelPolicies = await pool.query(
      "SELECT scope_key,requests,window_seconds FROM rate_limit_policies WHERE enabled=true AND scope_type='model' AND scope_key=$1",
      [modelId],
    );
    for (const policy of modelPolicies.rows) {
      const counter = await pool.query(
        `INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
         VALUES('model',$1,to_timestamp(floor(extract(epoch FROM now())/$2)*$2),1)
         ON CONFLICT(scope_type,scope_key,window_start)
         DO UPDATE SET request_count=rate_limit_counters.request_count+1 RETURNING request_count`,
        [policy.scope_key,policy.window_seconds],
      );
      if (Number(counter.rows[0]?.request_count || 0) > Number(policy.requests)) {
        res.setHeader('Retry-After', String(policy.window_seconds));
        sendJson(res, 429, { error: 'Model rate limit exceeded.', scope: 'model' }, requestId);
        return true;
      }
    }
  }
  return false;
}

export async function handleApiRequest(req: ApiRequest, res: ServerResponse): Promise<void> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const pathname = new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname;
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.info('API_REQUEST', JSON.stringify({ requestId, method: req.method, path: pathname, status: res.statusCode, durationMs }));
    if (pool && pathname.startsWith('/api/')) {
      const classification = res.statusCode >= 500 ? 'server_error' : res.statusCode >= 400 ? 'client_error' : 'success';
      void pool.query(
        'INSERT INTO admin_request_events(request_id,method,route,status_code,duration_ms,classification) VALUES($1,$2,$3,$4,$5,$6)',
        [requestId, req.method || 'GET', pathname.slice(0,240), res.statusCode, durationMs, classification],
      ).catch(() => {});
      if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode >= 500) {
        void pool.query(
          'INSERT INTO security_events(event_type,severity,request_id,metadata) VALUES($1,$2,$3,$4::jsonb)',
          [res.statusCode >= 500 ? 'api.server_error' : 'auth.access_denied', res.statusCode >= 500 ? 'warning' : 'info', requestId,
            JSON.stringify({ method: req.method || 'GET', route: pathname.slice(0,240), status: res.statusCode })],
        ).catch(() => {});
      }
    }
  });

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.end();
    return;
  }

  try {
    if (await enforceAdminConfiguredRateLimits(req, res, pathname, requestId)) return;
    if (await handleAuthApi(req, res, pathname)) return;
    if (await handleAccountApi(req, res, pathname)) return;
    if (await handleProductivityApi(req, res, pathname)) return;
    if (await handleAdminApi(req, res, pathname)) return;

    if (await handleResearchApi(req, res)) return;
    if (await handleVoiceApi(req, res)) return;

    if (pathname === '/api/chat') {
      await handleChatApi(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'afg-ai-api',
        timestamp: new Date().toISOString(),
      }, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/ready') {
      const database = await checkDatabase();
      const ready = database.configured && database.connected;
      sendJson(res, ready ? 200 : 503, {
        status: ready ? 'ready' : 'degraded',
        database,
      }, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/models') {
      const catalog = await getProviderModelCatalog();
      sendJson(res, catalog.status, catalog.body, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/studio/capabilities') {
      const snapshot = await getImageStudioSnapshot();
      sendJson(res, snapshot.available ? 200 : 503, snapshot, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/files/status') {
      const snapshot = await getFileAssistantSnapshot();
      sendJson(res, 200, snapshot, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/capabilities') {
      const snapshot = await getCapabilitySnapshot();
      sendJson(res, snapshot.verified ? 200 : 503, snapshot, requestId);
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'API route not found.' }, requestId);
      return;
    }

    sendJson(res, 404, { error: 'API route not found.' }, requestId);
  } catch {
    console.error('API_EDGE_FAILURE', JSON.stringify({ requestId, method: req.method, path: pathname }));
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'The API request failed unexpectedly.' }, requestId);
    } else {
      res.end();
    }
  }
}
