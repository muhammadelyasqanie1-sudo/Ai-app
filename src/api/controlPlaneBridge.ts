import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pool } from './database.ts';

const BRIDGE_PATH = '/api/internal/9router/overview';

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  const requestId = res.getHeader('X-Request-Id');
  res.end(JSON.stringify({ ...body, ...(typeof requestId === 'string' ? { requestId } : {}) }));
}

/**
 * Read-only service bridge for the 9Router management portal.
 * The shared credential must remain server-side in both applications.
 * This route deliberately returns aggregate operational data only.
 */
export async function handleControlPlaneBridgeApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== BRIDGE_PATH) return false;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    reply(res, 405, { error: 'Method not allowed.' });
    return true;
  }

  const expected = process.env.AFG_AI_9ROUTER_BRIDGE_TOKEN || '';
  if (expected.length < 32) {
    reply(res, 503, { available: false, error: 'The private management bridge is not configured.' });
    return true;
  }
  const authorization = req.headers.authorization || '';
  const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!candidate || candidate.length > 512 || !matchesSecret(candidate, expected)) {
    reply(res, 401, { available: false, error: 'Unauthorized.' });
    return true;
  }
  if (!pool) {
    reply(res, 503, { available: false, error: 'AFG AI database is unavailable.' });
    return true;
  }

  try {
    const [users, today, latency, requests, providers, models, integrations, flags] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status='active')::int AS active,
        count(*) FILTER (WHERE status='suspended')::int AS suspended
        FROM users`),
      pool.query(`SELECT count(*)::int AS requests,
        count(*) FILTER (WHERE status<>'success')::int AS errors,
        COALESCE(sum(cost_usd),0)::numeric(18,6) AS cost_usd,
        COALESCE(sum(tokens_in),0)::bigint AS input_tokens,
        COALESCE(sum(tokens_out),0)::bigint AS output_tokens,
        count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS active_users
        FROM usage_records WHERE created_at>=date_trunc('day',now())`),
      pool.query(`SELECT COALESCE(avg(latency_ms),0)::numeric(12,2) AS average_ms,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::numeric(12,2) AS p95_ms
        FROM usage_records WHERE created_at>=now()-interval '24 hours'`),
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status_code>=500)::int AS server_errors,
        count(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS client_errors
        FROM admin_request_events WHERE created_at>=now()-interval '24 hours'`),
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE enabled=true)::int AS enabled,
        count(*) FILTER (WHERE enabled=true AND last_health_ok=false)::int AS failing
        FROM providers`),
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE enabled=true)::int AS enabled,
        count(*) FILTER (WHERE enabled=true AND (verified_at IS NULL OR last_health_ok IS DISTINCT FROM true))::int AS needs_verification
        FROM model_catalog`),
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE enabled=true AND status='active' AND last_check_ok=true)::int AS healthy
        FROM integrations`),
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE enabled=true)::int AS enabled
        FROM feature_flags`),
    ]);

    reply(res, 200, {
      available: true,
      service: 'AFG AI',
      generatedAt: new Date().toISOString(),
      users: users.rows[0],
      today: today.rows[0],
      latency24h: latency.rows[0],
      requests24h: requests.rows[0],
      providers: providers.rows[0],
      models: models.rows[0],
      integrations: integrations.rows[0],
      featureFlags: flags.rows[0],
    });
  } catch {
    console.error('AFG_AI_CONTROL_PLANE_BRIDGE_QUERY_FAILED');
    reply(res, 503, { available: false, error: 'AFG AI management data is temporarily unavailable.' });
  }
  return true;
}
