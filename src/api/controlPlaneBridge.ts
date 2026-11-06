import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pool } from './database.ts';
import { readJsonBody } from './auth.ts';

const BRIDGE_PATH = '/api/internal/9router/overview';
const USERS_PATH = '/api/internal/9router/users';
const SUBSCRIPTIONS_PATH = '/api/internal/9router/subscriptions';

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


function readBridgeActor(req: IncomingMessage) {
  const id = String(req.headers['x-9router-actor-id'] || '').trim();
  const email = String(req.headers['x-9router-actor-email'] || '').trim().toLowerCase();
  const role = String(req.headers['x-9router-actor-role'] || '').trim();
  const rawPermissions = String(req.headers['x-9router-actor-permissions'] || '[]');
  if (!id || id.length > 128 || !/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) return null;
  if (!['superadmin', 'admin', 'staff'].includes(role) || rawPermissions.length > 4096) return null;
  try {
    const permissions = JSON.parse(rawPermissions);
    if (!Array.isArray(permissions) || permissions.length > 100 || permissions.some((value) => typeof value !== 'string' || value.length > 80)) return null;
    return { id, email, role, permissions };
  } catch { return null; }
}

function bridgeActorHas(actor: ReturnType<typeof readBridgeActor>, permission: string) {
  return Boolean(actor && (actor.role === 'superadmin' || actor.permissions.includes('*') || actor.permissions.includes(permission)));
}

async function handleUserList(req: IncomingMessage, res: ServerResponse) {
  const actor = readBridgeActor(req);
  if (!bridgeActorHas(actor, 'afg-ai:users:read')) {
    reply(res, actor ? 403 : 401, { error: actor ? 'AFG AI user read permission required.' : 'A valid control-plane actor is required.' });
    return true;
  }
  if (!pool) { reply(res, 503, { error: 'AFG AI database is unavailable.' }); return true; }
  const result = await pool.query(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,
      (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen_at,
      (SELECT count(*)::int FROM usage_events e WHERE e.user_id=u.id AND e.created_at>now()-interval '30 days') AS requests_30d
    FROM users u WHERE u.status <> 'deleted' ORDER BY u.created_at DESC LIMIT 250`);
  reply(res, 200, { users: result.rows });
  return true;
}

async function handleUserStatusUpdate(req: IncomingMessage, res: ServerResponse) {
  const actor = readBridgeActor(req);
  if (!bridgeActorHas(actor, 'afg-ai:users:manage')) {
    reply(res, actor ? 403 : 401, { error: actor ? 'AFG AI user management permission required.' : 'A valid control-plane actor is required.' });
    return true;
  }
  if (!pool) { reply(res, 503, { error: 'AFG AI database is unavailable.' }); return true; }
  let body: Record<string, unknown>;
  try { body = await readJsonBody(req, 8000); }
  catch { reply(res, 400, { error: 'Invalid JSON request body.' }); return true; }
  const targetId = typeof body.userId === 'string' ? body.userId : '';
  const status = typeof body.status === 'string' ? body.status : '';
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || !['active', 'suspended'].includes(status)) {
    reply(res, 400, { error: 'Provide a valid user ID and status (active or suspended).' });
    return true;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('afg-ai:admin-bootstrap'))");
    const target = await client.query("SELECT id,email,role,status FROM users WHERE id=$1 AND status <> 'deleted' FOR UPDATE", [targetId]);
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      reply(res, 404, { error: 'User not found.' });
      return true;
    }
    const previous = target.rows[0];
    if (String(previous.email || '').toLowerCase() === actor.email && status === 'suspended') {
      await client.query('ROLLBACK');
      reply(res, 403, { error: 'You cannot suspend your own AFG AI account from the control plane.' });
      return true;
    }
    if (['admin', 'superadmin'].includes(previous.role) && actor.role !== 'superadmin') {
      await client.query('ROLLBACK');
      reply(res, 403, { error: 'Only the control-plane superadmin may change an AFG AI administrator account.' });
      return true;
    }
    if (previous.role === 'superadmin' && actor.role !== 'superadmin') {
      await client.query('ROLLBACK');
      reply(res, 403, { error: 'Only the control-plane superadmin may change a superadmin account.' });
      return true;
    }
    if (actor.id === 'bootstrap' && previous.role === 'superadmin' && status === 'suspended') {
      await client.query('ROLLBACK');
      reply(res, 403, { error: 'Use a named superadmin control-plane account to manage AFG AI superadmin access.' });
      return true;
    }
    if (previous.status === 'active' && status === 'suspended' && ['admin', 'superadmin'].includes(previous.role)) {
      const admins = await client.query("SELECT count(*)::int AS total FROM users WHERE role IN ('admin','superadmin') AND status='active'");
      if (Number(admins.rows[0]?.total || 0) <= 1) {
        await client.query('ROLLBACK');
        reply(res, 409, { error: 'At least one active AFG AI administrator must remain.' });
        return true;
      }
    }
    if (previous.status === 'active' && status === 'suspended' && previous.role === 'superadmin') {
      const owners = await client.query("SELECT count(*)::int AS total FROM users WHERE role='superadmin' AND status='active'");
      if (Number(owners.rows[0]?.total || 0) <= 1) {
        await client.query('ROLLBACK');
        reply(res, 409, { error: 'At least one active AFG AI superadmin must remain.' });
        return true;
      }
    }
    const updated = await client.query(
      "UPDATE users SET status=$2,updated_at=now() WHERE id=$1 AND status <> 'deleted' RETURNING id,role,status",
      [targetId, status],
    );
    if (status === 'suspended') {
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [targetId]);
    }
    await client.query(
      'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES(NULL,$1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)',
      ['9router:' + actor.role, 'user.access.update', 'user', targetId,
        JSON.stringify({ status: previous.status, role: previous.role }),
        JSON.stringify({ status: updated.rows[0].status, role: updated.rows[0].role }),
        JSON.stringify({ source: '9router-control-plane', actorId: actor.id, actorEmail: actor.email })],
    );
    await client.query('COMMIT');
    reply(res, 200, { user: updated.rows[0] });
  } catch {
    await client.query('ROLLBACK');
    reply(res, 503, { error: 'AFG AI user status update failed.' });
  } finally {
    client.release();
  }
  return true;
}


async function handleSubscriptionsRead(req: IncomingMessage, res: ServerResponse) {
  const actor = readBridgeActor(req);
  if (!bridgeActorHas(actor, 'afg-ai:subscriptions:read')) {
    reply(res, actor ? 403 : 401, { error: actor ? 'AFG AI subscription read permission required.' : 'A valid control-plane actor is required.' });
    return true;
  }
  if (!pool) { reply(res, 503, { error: 'AFG AI database is unavailable.' }); return true; }
  const [subscriptions, plans] = await Promise.all([
    pool.query(`SELECT s.id,s.user_id,u.email,p.plan_key,p.display_name AS plan_name,
        s.status,s.starts_at,s.ends_at,s.provider,s.created_at
      FROM user_subscriptions s JOIN users u ON u.id=s.user_id
      JOIN subscription_plans p ON p.id=s.plan_id
      ORDER BY s.created_at DESC LIMIT 300`),
    pool.query(`SELECT plan_key,display_name,monthly_price_usd,limits_json,features_json,enabled
      FROM subscription_plans ORDER BY monthly_price_usd,plan_key`),
  ]);
  reply(res, 200, { subscriptions: subscriptions.rows, plans: plans.rows });
  return true;
}

async function handleSubscriptionAssign(req: IncomingMessage, res: ServerResponse) {
  const actor = readBridgeActor(req);
  if (!bridgeActorHas(actor, 'afg-ai:subscriptions:manage')) {
    reply(res, actor ? 403 : 401, { error: actor ? 'AFG AI subscription management permission required.' : 'A valid control-plane actor is required.' });
    return true;
  }
  if (!pool) { reply(res, 503, { error: 'AFG AI database is unavailable.' }); return true; }
  let body: Record<string, unknown>;
  try { body = await readJsonBody(req, 8000); }
  catch { reply(res, 400, { error: 'Invalid JSON request body.' }); return true; }
  const targetId = typeof body.userId === 'string' ? body.userId : '';
  const planKey = typeof body.planKey === 'string' ? body.planKey : '';
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || !['free', 'pro'].includes(planKey)) {
    reply(res, 400, { error: 'Provide a valid user ID and an enabled free or pro plan.' });
    return true;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const plan = await client.query('SELECT id,plan_key FROM subscription_plans WHERE plan_key=$1 AND enabled=true FOR SHARE', [planKey]);
    const target = await client.query("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE", [targetId]);
    if (!plan.rows[0] || !target.rows[0]) {
      await client.query('ROLLBACK');
      reply(res, 404, { error: 'Active user or enabled plan not found.' });
      return true;
    }
    const previous = await client.query(`SELECT s.id,p.plan_key,s.status,s.starts_at,s.ends_at
      FROM user_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id
      WHERE s.user_id=$1 AND s.status IN ('active','trialing')
      ORDER BY s.starts_at DESC LIMIT 1 FOR UPDATE OF s`, [targetId]);
    if (previous.rows[0]?.plan_key === planKey && previous.rows[0]?.status === 'active') {
      await client.query('COMMIT');
      reply(res, 200, { subscription: { id: previous.rows[0].id, status: 'active', planKey, unchanged: true } });
      return true;
    }
    await client.query("UPDATE user_subscriptions SET status='cancelled',ends_at=now(),updated_at=now() WHERE user_id=$1 AND status IN ('active','trialing')", [targetId]);
    const created = await client.query(`INSERT INTO user_subscriptions(user_id,plan_id,status,provider)
      VALUES($1,$2,'active','admin_manual') RETURNING id,status,starts_at`, [targetId, plan.rows[0].id]);
    await client.query(
      'INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_json,after_json,metadata) VALUES(NULL,$1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)',
      ['9router:' + actor.role, 'subscription.plan.assign', 'user', targetId,
        JSON.stringify({ planKey: previous.rows[0]?.plan_key || null, status: previous.rows[0]?.status || null }),
        JSON.stringify({ planKey, status: created.rows[0].status, subscriptionId: created.rows[0].id }),
        JSON.stringify({ source: '9router-control-plane', actorId: actor.id, actorEmail: actor.email })],
    );
    await client.query('COMMIT');
    reply(res, 200, { subscription: { ...created.rows[0], planKey } });
  } catch {
    await client.query('ROLLBACK');
    reply(res, 503, { error: 'AFG AI subscription update failed.' });
  } finally {
    client.release();
  }
  return true;
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
  if (pathname === SUBSCRIPTIONS_PATH) {
    if (req.method === 'GET') return await handleSubscriptionsRead(req, res);
    if (req.method === 'PATCH') return await handleSubscriptionAssign(req, res);
    res.setHeader('Allow', 'GET, PATCH');
    reply(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  if (pathname === USERS_PATH) {
    if (req.method === 'GET') return await handleUserList(req, res);
    if (req.method === 'PATCH') return await handleUserStatusUpdate(req, res);
    res.setHeader('Allow', 'GET, PATCH');
    reply(res, 405, { error: 'Method not allowed.' });
    return true;
  }
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
