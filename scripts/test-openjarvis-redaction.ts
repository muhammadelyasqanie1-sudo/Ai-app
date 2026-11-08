import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { pool } from '../src/api/database.ts';
import { handleOpenJarvisApi } from '../src/api/openjarvis.ts';

const databaseUrl = new URL(process.env.DATABASE_URL || '');
assert.equal(databaseUrl.hostname, '127.0.0.1');
assert.equal(databaseUrl.port, '55432');
assert.equal(databaseUrl.pathname, '/afg_agent_test');
const userId = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
const privateMarker = 'synthetic-upstream-private-error-marker';
let failUpstream = true, upstreamCalls = 0;
const upstream = createServer((req, res) => {
  upstreamCalls++;
  if (failUpstream) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: privateMarker }));
  } else if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'synthetic-model' }] }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n');
  }
});
await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
process.env.OPENJARVIS_INTERNAL_URL = `http://127.0.0.1:${(upstream.address() as any).port}`;
process.env.OPENJARVIS_API_KEY = 'synthetic-test-key';
const api = createServer((req, res) => {
  void handleOpenJarvisApi(req, res, new URL(req.url!, 'http://localhost').pathname, 'test-request-id')
    .catch(() => { res.statusCode = 500; res.end(); });
});
await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
const port = (api.address() as any).port;
const headers = { Cookie: `afg_session=${token}; afg_csrf=${csrf}`, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
const body = JSON.stringify({ model: 'synthetic-model', messages: [{ role: 'user', content: 'hello' }], stream: true });
try {
  await pool!.query("INSERT INTO users(id,email,display_name) VALUES($1,$2,'OpenJarvis regression')", [userId, userId + '@example.invalid']);
  await pool!.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [userId, createHash('sha256').update(token).digest('hex')]);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/openjarvis/models`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/openjarvis/chat/completions`, { method: 'POST', headers: { Cookie: headers.Cookie, 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal(upstreamCalls, 0);
  for (const [path, options] of [
    ['/api/openjarvis/models', { headers }],
    ['/api/openjarvis/chat/completions', { method: 'POST', headers, body }],
  ] as const) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    assert.equal(response.status, 429);
    const text = await response.text();
    assert(!text.includes(privateMarker));
    assert(!text.includes('synthetic-test-key'));
    assert.equal(JSON.parse(text).requestId, 'test-request-id');
  }
  failUpstream = false;
  const models = await (await fetch(`http://127.0.0.1:${port}/api/openjarvis/models`, { headers })).json();
  assert.equal(models.data[0].id, 'synthetic-model');
  const stream = await fetch(`http://127.0.0.1:${port}/api/openjarvis/chat/completions`, { method: 'POST', headers, body });
  assert.equal(stream.status, 200);
  assert.match(await stream.text(), /\[DONE\]/);
  console.log('OpenJarvis authenticated error redaction, CSRF, model discovery and SSE relay passed (synthetic local upstream).');
} finally {
  await new Promise<void>(resolve => api.close(() => resolve()));
  await new Promise<void>(resolve => upstream.close(() => resolve()));
  await pool!.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
  await pool!.query("UPDATE users SET deleted_at=now(),email=$2 WHERE id=$1", [userId, userId + '@deleted.invalid']);
  await pool!.end();
}
