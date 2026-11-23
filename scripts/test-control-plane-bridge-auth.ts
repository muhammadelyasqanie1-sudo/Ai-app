// Regression test: the /api/internal/9router/* control-plane bridge must
// require the server-side AFG_AI_9ROUTER_BRIDGE_TOKEN bearer credential on
// EVERY handler. The x-9router-actor-* headers are client-supplied
// attribution and must never authenticate anything on their own.
// Coverage: unset token (503), forged actor headers without token (401),
// wrong token (401), non-Bearer scheme (401), valid token reaches the DB
// gate (503 when DB absent), GET-only overview (405 on mutation).
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import { handleControlPlaneBridgeApi } from '../src/api/controlPlaneBridge.ts';

const PORT = 31993;

function makeReq(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'x-9router-actor-id': 'bridge-test-actor',
    'x-9router-actor-email': 'actor@9router.invalid',
    'x-9router-actor-role': 'superadmin',
    'x-9router-actor-permissions': '["*"]',
    ...overrides,
  };
}

interface Captured { status: number; body: string }

/** Fire one real HTTP request through the bridge dispatcher and capture the response. */
function capture(pathname: string, headers: Record<string, string>, method: string): Promise<Captured> {
  return new Promise((resolve, reject) => {
    const server = createServer((creq, cres) => { void handleControlPlaneBridgeApi(creq, cres, String(creq.url)); });
    server.listen(PORT, '127.0.0.1', () => {
      const r = httpRequest({ host: '127.0.0.1', port: PORT, path: pathname, method, headers });
      r.on('response', (res) => {
        let body = '';
        res.on('data', (d) => { body += String(d); });
        res.on('end', () => { server.close(() => resolve({ status: res.statusCode || 0, body })); });
      });
      r.on('error', (error) => { server.close(); reject(error); });
      r.end();
    });
    server.on('error', reject);
  });
}

async function main() {
  delete process.env.AFG_AI_9ROUTER_BRIDGE_TOKEN;
  // Unset token: 503 not-configured on user listing, even with forged actor headers.
  const unset = await capture('/api/internal/9router/users', makeReq(), 'GET');
  assert.equal(unset.status, 503, 'unset token must yield 503');
  assert.match(unset.body, /not configured/);

  // Once configured, forged actor headers without a bearer token: 401.
  const TOKEN = 'x'.repeat(48);
  process.env.AFG_AI_9ROUTER_BRIDGE_TOKEN = TOKEN;
  for (const path of ['/api/internal/9router/users', '/api/internal/9router/subscriptions']) {
    const forged = await capture(path, makeReq(), 'GET');
    assert.equal(forged.status, 401, `forged actor headers must not authenticate ${path}`);
    const wrong = await capture(path, makeReq({ authorization: 'Bearer ' + 'y'.repeat(48) }), 'GET');
    assert.equal(wrong.status, 401, 'wrong bearer token must be rejected');
    const scheme = await capture(path, makeReq({ authorization: 'Basic ' + TOKEN }), 'GET');
    assert.equal(scheme.status, 401, 'non-Bearer scheme must be rejected');
  }

  // Valid bearer token passes the bridge gate and reaches the database gate (503 when no pool).
  const valid = await capture('/api/internal/9router/users', makeReq({ authorization: 'Bearer ' + TOKEN }), 'GET');
  assert.ok([200, 503].includes(valid.status), 'valid token reaches the handler DB gate');

  // Overview stays GET-only.
  const overview = await capture('/api/internal/9router/overview', makeReq({ authorization: 'Bearer ' + TOKEN }), 'POST');
  assert.equal(overview.status, 405, 'overview mutations are rejected');

  delete process.env.AFG_AI_9ROUTER_BRIDGE_TOKEN;
  console.log('CONTROL_PLANE_BRIDGE_AUTH_REGRESSION_TESTS_PASSED');
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
