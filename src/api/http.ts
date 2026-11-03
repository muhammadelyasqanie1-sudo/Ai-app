import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { handleChatApi } from './chatHandler.ts';
import { checkDatabase, pool } from './database.ts';
import { getProviderModelCatalog } from './modelCatalog.ts';
import { getCapabilitySnapshot, getImageStudioSnapshot, getFileAssistantSnapshot } from '../services/providerGateway.ts';
import { authenticateRequest, handleAuthApi, verifyCsrf } from './auth.ts';
import { createHash } from 'crypto';
import { handleAdminApi } from './adminHandler.ts';
import { handleResearchApi } from './research.ts';
import { handleVoiceApi } from './voice.ts';
import { handleProductivityApi } from './productivity.ts';
import { handleAccountApi } from './account.ts';
import { handleConversationsApi } from './conversations.ts';
import { handleTerminalApi } from './terminal.ts';
import { redactSecret } from '../security/providerVault.ts';

type ApiRequest = IncomingMessage & { originalUrl?: string };

const localIpRateCounters = new Map<string, { count: number; resetAt: number }>();

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
  // Guest requests have no authenticated identity or subscription policy. Avoid
  // querying session tables for them so public chat remains available during DB setup.
  if (!/(?:^|;)\\s*afg_session=/.test(req.headers.cookie || '')) return false;
  let account: Awaited<ReturnType<typeof authenticateRequest>> = null;
  try { account = await authenticateRequest(req); } catch {
    sendJson(res,503,{error:'Authentication checks are temporarily unavailable.'},requestId);
    return true;
  }
  if (!account) return false;
  let policies;
  try {
    const subscription = await pool.query(
      `SELECT p.plan_key FROM user_subscriptions s
         JOIN subscription_plans p ON p.id=s.plan_id
        WHERE s.user_id=$1 AND s.status IN ('active','trialing')
          AND (s.ends_at IS NULL OR s.ends_at>now())
        ORDER BY s.starts_at DESC LIMIT 1`,
      [account.id],
    );
    const tier = subscription.rows[0]?.plan_key || 'free';
    policies = await pool.query(
      `SELECT scope_type,scope_key,requests,window_seconds FROM rate_limit_policies
        WHERE enabled=true AND ((scope_type='user' AND scope_key IN ($1,'*')) OR (scope_type='tier' AND scope_key=$2))
        ORDER BY CASE WHEN scope_type='user' THEN 0 ELSE 1 END`,
      [account.id, tier],
    );
  } catch {
    sendJson(res,503,{error:'Rate limiting is temporarily unavailable.'},requestId);
    return true;
  }
  for (const policy of policies.rows) {
    const counter = await pool.query(
      `INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
       VALUES($1,$2,to_timestamp((floor(extract(epoch FROM now())/$3)*$3)::double precision),1)
       ON CONFLICT(scope_type,scope_key,window_start)
       DO UPDATE SET request_count=rate_limit_counters.request_count+1
       RETURNING request_count`,
      [policy.scope_type,policy.scope_type === 'user' && policy.scope_key === '*' ? account.id : policy.scope_key,policy.window_seconds],
    );
    if (Number(counter.rows[0]?.request_count || 0) > Number(policy.requests)) {
      res.setHeader('Retry-After', String(policy.window_seconds));
      sendJson(res, 429, { error: 'Rate limit exceeded.', scope: policy.scope_type }, requestId);
      return true;
    }
  }
  // Model-specific limits are enforced inside chatHandler after the gateway selects the actual model.
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
      if(res.statusCode>=400){
        const errorClass=res.statusCode===401||res.statusCode===403?'auth':
          res.statusCode===429?'rate_limit':res.statusCode===408||res.statusCode===504?'timeout':
          res.statusCode===400||res.statusCode===413?'invalid_request':
          res.statusCode>=500?'provider_5xx':'unknown';
        void pool.query(`INSERT INTO error_logs(request_id,error_code,error_class,message_redacted,metadata_json)
          VALUES($1,$2,$3,$4,$5::jsonb)`,
          [requestId,'http_'+res.statusCode,errorClass,redactSecret('Request failed ('+errorClass+').'),
            JSON.stringify({method:req.method||'GET',route:pathname.slice(0,240),status:res.statusCode,durationMs})]).catch(()=>{});
      }
      if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode >= 500) {
        void pool.query(
          'INSERT INTO security_events(event_type,severity,request_id,metadata) VALUES($1,$2,$3,$4::jsonb)',
          [res.statusCode >= 500 ? 'api.server_error' : 'auth.access_denied', res.statusCode >= 500 ? 'warning' : 'info', requestId,
            JSON.stringify({ method: req.method || 'GET', route: pathname.slice(0,240), status: res.statusCode })],
        ).catch(() => {});
      }
    }
  });

  // Cookie-authenticated state changes must pass the double-submit CSRF check.
  const unsafeMethod = !['GET','HEAD','OPTIONS'].includes(req.method || 'GET');
  const hasSessionCookie = /(?:^|;)\s*afg_session=/.test(req.headers.cookie || '');
  // CSRF protection is required for ambient cookie-authenticated requests.
  // An Origin header alone must not block guest chat: guests have no session cookie
  // and therefore no authenticated browser state for an attacker to exploit.
  if (unsafeMethod && hasSessionCookie && !verifyCsrf(req)) {
    sendJson(res, 403, { error: 'CSRF validation failed.' }, requestId);
    return;
  }

  // Distributed IP throttling; hash the address before storing it in the database.
  if (pool && pathname.startsWith('/api/') && !['/api/health','/api/ready'].includes(pathname)) {
    const clientIp = (req as ApiRequest & { ip?: string }).ip || req.socket.remoteAddress || 'unknown';
    const ipKey = createHash('sha256').update(clientIp).digest('hex');
    try {
      const ipPolicy = await pool.query("SELECT requests,window_seconds FROM rate_limit_policies WHERE enabled=true AND scope_type='ip' AND scope_key='*' LIMIT 1");
      const maxRequests = Number(ipPolicy.rows[0]?.requests || 120);
      const windowSeconds = Number(ipPolicy.rows[0]?.window_seconds || 60);
      const ipCounter = await pool.query(
        `INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
         VALUES('ip',$1,to_timestamp((floor(extract(epoch FROM now())/$2)*$2)::double precision),1)
         ON CONFLICT(scope_type,scope_key,window_start)
         DO UPDATE SET request_count=rate_limit_counters.request_count+1
         RETURNING request_count`,
        [ipKey,windowSeconds],
      );
      if (Number(ipCounter.rows[0]?.request_count || 0) > maxRequests) {
        res.setHeader('Retry-After',String(windowSeconds));
        sendJson(res,429,{error:'Too many requests from this network. Please retry shortly.',scope:'ip'},requestId);
        return;
      }
    } catch {
      // Keep guest chat usable while optional database rate-limit tables are being
      // initialized. Apply a conservative per-process fallback instead of failing closed.
      const now = Date.now();
      const previous = localIpRateCounters.get(ipKey);
      if (!previous || previous.resetAt <= now) {
        localIpRateCounters.set(ipKey, { count: 1, resetAt: now + 60_000 });
      } else {
        previous.count += 1;
        if (previous.count > 120) {
          res.setHeader('Retry-After', '60');
          sendJson(res,429,{error:'Too many requests from this network. Please retry shortly.',scope:'ip'},requestId);
          return;
        }
      }
      console.warn('API_IP_RATE_LIMIT_DB_UNAVAILABLE');
    }
  }

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
    if (await handleConversationsApi(req, res, pathname)) return;
    if (await handleTerminalApi(req, res, pathname, requestId)) return;
    if (await handleProductivityApi(req, res, pathname)) return;
    if (await handleAdminApi(req, res, pathname)) return;

    if (pathname.startsWith('/api/research') && pool) {
      const flag = await pool.query("SELECT enabled FROM feature_flags WHERE flag_key='research' LIMIT 1").catch(() => ({ rows: [] as any[] }));
      if (flag.rows[0] && flag.rows[0].enabled === false) {
        sendJson(res, 503, { error: 'Research is temporarily disabled by the administrator.', feature: 'research' }, requestId);
        return;
      }
    }
    if ((pathname.startsWith('/api/voice') || pathname.startsWith('/api/speech')) && pool) {
      const flag = await pool.query("SELECT enabled FROM feature_flags WHERE flag_key='voice' LIMIT 1").catch(() => ({ rows: [] as any[] }));
      if (flag.rows[0] && flag.rows[0].enabled === false) {
        sendJson(res, 503, { error: 'Voice features are temporarily disabled by the administrator.', feature: 'voice' }, requestId);
        return;
      }
    }
    if (await handleResearchApi(req, res)) return;
    if (await handleVoiceApi(req, res)) return;

    if (pathname === '/api/chat') {
      if (pool) {
        const flag = await pool.query("SELECT enabled FROM feature_flags WHERE flag_key='chat' LIMIT 1").catch(() => ({ rows: [] as any[] }));
        if (flag.rows[0] && flag.rows[0].enabled === false) {
          sendJson(res, 503, { error: 'Chat is temporarily disabled by the administrator.', feature: 'chat' }, requestId);
          return;
        }
      }
      await handleChatApi(req, res);
      return;
    }

    if(req.method==='GET' && pathname==='/api/announcements'){
      if(!pool){sendJson(res,200,{announcements:[]},requestId);return;}
      try{
        const result=await pool.query(`SELECT id,title,body,starts_at,expires_at,created_at
          FROM announcements WHERE enabled=true AND starts_at<=now()
            AND (expires_at IS NULL OR expires_at>now())
          ORDER BY created_at DESC LIMIT 5`);
        sendJson(res,200,{announcements:result.rows},requestId);
      }catch{
        sendJson(res,200,{announcements:[]},requestId);
      }
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
