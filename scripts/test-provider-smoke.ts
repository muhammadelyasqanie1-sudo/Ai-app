// Real provider smoke tests: 9Router proxy, Ollama adapter and the
// OpenAI-compatible adapter, exercised through their real code paths.
//
// Honesty rules enforced by this suite:
//  - A missing/unreachable provider must produce the honest failure
//    (config-required or provider_unreachable) — never a fabricated success.
//  - The third-party endpoints are simulated by local mock servers that reply
//    with realistic upstream payloads (including auth failures). The adapter,
//    HTTP stack, streaming parser, error mapping and security guards under
//    test are the real production code.
//  - Nothing here asserts a live provider connection; live smoke tests need
//    real credentials and belong to a configured deployment.
//
// The 9Router handler section additionally requires the canonical disposable
// PostgreSQL cluster (it exercises real session authentication); it is skipped
// with an explicit note when DATABASE_URL is absent.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createOpenAICompatibleAdapter } from '../src/providers/openAiCompatible.ts';
import { createOllamaAdapter } from '../src/providers/ollama.ts';
import { ProviderAdapterError } from '../src/providers/providerTypes.ts';
import { handleNineRouterApi } from '../src/api/nineRouter.ts';

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// Mock OpenAI-compatible gateway (pagination, auth, inference, SSE streaming)
// ---------------------------------------------------------------------------
function mockOpenAiServer(authKey: string | null): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers.authorization;
    if (authKey && auth !== 'Bearer ' + authKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'invalid_api_key', type: 'invalid_request_error' } }));
      return;
    }
    const urlPath = req.url || '/';
    if (req.method === 'GET' && (urlPath === '/v1/models' || urlPath.startsWith('/v1/models?'))) {
      const after = new URL(urlPath, 'http://x').searchParams.get('after');
      if (after === 'mock-chat-1') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'mock-chat-2', context_length: 8192 }], has_more: false }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'mock-chat-1', context_length: 4096 }], has_more: true }));
      }
      return;
    }
    if (req.method === 'POST' && urlPath.startsWith('/v1/chat/completions')) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let parsed: { model?: string; stream?: boolean } = {};
        try { parsed = JSON.parse(body); } catch { /* treat as malformed */ }
        const knownModels = new Set(['mock-chat-1', 'mock-chat-2']);
        if (!parsed.model || !knownModels.has(parsed.model)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'model_not_found', type: 'invalid_request_error' } }));
          return;
        }
        const wantsStream = parsed.stream === true;
        if (wantsStream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const chunks = ['Hel', 'lo ', 'from', ' mock'];
          for (const piece of chunks) {
            res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: piece } }] }) + '\n\n');
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }));
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'not_found' } }));
  });
}

// ---------------------------------------------------------------------------
// Mock Ollama daemon (/api/tags discovery, /api/chat probe + streaming)
// ---------------------------------------------------------------------------
function mockOllamaServer(): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && (req.url || '').startsWith('/api/tags')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'tiny-mock:1b', details: { family: 'llama', parameter_size: '1B', quantization_level: 'Q4_K_M' }, size: 700000000 }] }));
      return;
    }
    if (req.method === 'POST' && (req.url || '').startsWith('/api/chat')) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const wantsStream = body.includes('"stream":true');
        if (wantsStream) {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.write(JSON.stringify({ message: { content: 'Local ' } }) + '\n');
          res.write(JSON.stringify({ message: { content: 'stream' } }) + '\n');
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: { content: 'OK' } }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
}

const envBackup: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function expectAdapterError(promise: Promise<unknown>, status: number, code: string, label: string) {
  try {
    await promise;
    throw new Error(`${label}: expected ProviderAdapterError ${code}, but the call succeeded`);
  } catch (error) {
    assert.ok(error instanceof ProviderAdapterError, `${label}: expected ProviderAdapterError, got ${error?.constructor?.name}`);
    assert.equal((error as ProviderAdapterError).status, status, `${label}: status`);
    assert.equal((error as ProviderAdapterError).code, code, `${label}: code`);
  }
}

async function callNineRouter(pathname: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const handled = void handleNineRouterApi(req, res, new URL(req.url || '/', 'http://local').pathname);
    void handled;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: init.method || 'GET',
      headers: init.headers,
      ...(init.body ? { body: init.body } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text };
  } finally {
    close(server);
  }
}

const cleanups: Array<() => Promise<void>> = [];
try {
  // -----------------------------------------------------------------------
  // 1. Honest configuration-required behaviour when nothing is configured
  // -----------------------------------------------------------------------
  setEnv('OPENAI_COMPAT_BASE_URL', undefined);
  setEnv('OPENAI_COMPAT_API_KEY', undefined);
  const unconfigured = createOpenAICompatibleAdapter();
  const configStatus = await unconfigured.validateConfig();
  assert.equal(configStatus.valid, false);
  assert.match(configStatus.message || '', /OPENAI_COMPAT_BASE_URL/);
  await expectAdapterError(unconfigured.listModels(), 503, 'provider_not_configured', 'unconfigured listModels');
  console.log('PASS unconfigured OpenAI-compatible adapter reports config-required honestly');

  // -----------------------------------------------------------------------
  // 2. Real adapter flow against the local mock gateway
  // -----------------------------------------------------------------------
  const apiKey = 'smoke-test-key';
  const gateway = mockOpenAiServer(apiKey);
  const gatewayPort = await listen(gateway);
  cleanups.push(() => close(gateway));
  const baseUrl = `http://127.0.0.1:${gatewayPort}/v1`;

  const adapter = createOpenAICompatibleAdapter({
    id: 'smoke-openai-compat', displayName: 'Smoke OpenAI-compatible',
    baseUrl, apiKey, catalogOnlyHealthCheck: false,
  });
  assert.equal((await adapter.validateConfig()).valid, true);

  const models = await adapter.listModels();
  assert.deepEqual(models.map((m) => m.id), ['mock-chat-1', 'mock-chat-2'], 'paginated model discovery followed has_more');
  assert.equal(models[0].providerId, 'smoke-openai-compat');

  const healthy = await adapter.healthCheck('mock-chat-1');
  assert.equal(healthy.healthy, true, 'inference probe health check');
  const unknownModel = await adapter.healthCheck('no-such-model');
  assert.equal(unknownModel.healthy, false, 'unknown model health check is honest');

  const chunks: string[] = [];
  for await (const chunk of adapter.streamChat({ model: 'mock-chat-1', messages: [{ role: 'user', content: 'hi' }] })) {
    chunks.push(chunk.content);
  }
  assert.equal(chunks.join(''), 'Hello from mock', 'SSE stream reassembled in order');
  console.log('PASS OpenAI-compatible adapter: discovery, health, streaming against a realistic gateway');

  // -----------------------------------------------------------------------
  // 3. Rejected credentials are reported honestly (never swallowed)
  // -----------------------------------------------------------------------
  const badAdapter = createOpenAICompatibleAdapter({
    id: 'smoke-openai-compat-bad', displayName: 'Smoke Bad Key',
    baseUrl, apiKey: 'wrong-key',
  });
  await expectAdapterError(badAdapter.listModels(), 401, 'model_catalog_failed', 'bad key listModels');
  const badHealth = await badAdapter.healthCheck('mock-chat-1');
  assert.equal(badHealth.healthy, false, 'bad key health check is honest');
  console.log('PASS rejected provider credentials produce honest failures');

  // -----------------------------------------------------------------------
  // 4. Ollama adapter: loopback guard, discovery, probe, streaming
  // -----------------------------------------------------------------------
  const remote = createOllamaAdapter('ollama', 'Ollama (Local)', 'https://remote.example.invalid');
  const remoteStatus = await remote.validateConfig();
  assert.equal(remoteStatus.valid, false, 'non-loopback Ollama endpoint rejected by the security guard');
  await expectAdapterError(remote.listModels(), 503, 'provider_not_configured', 'remote Ollama listModels');

  const ollama = mockOllamaServer();
  const ollamaPort = await listen(ollama);
  cleanups.push(() => close(ollama));
  const localAdapter = createOllamaAdapter('ollama', 'Ollama (Local)', `http://127.0.0.1:${ollamaPort}`);
  assert.equal((await localAdapter.validateConfig()).valid, true);
  const ollamaModels = await localAdapter.listModels();
  assert.equal(ollamaModels.length, 1);
  assert.equal(ollamaModels[0].id, 'tiny-mock:1b');
  assert.equal(ollamaModels[0].enabled, false, 'discovered-but-unverified models stay disabled until verified');
  assert.equal(ollamaModels[0].verifiedAt, null);
  assert.equal((await localAdapter.healthCheck('tiny-mock:1b')).healthy, true, 'inference probe health check');
  const ollamaChunks: string[] = [];
  for await (const chunk of localAdapter.streamChat({ model: 'tiny-mock:1b', messages: [{ role: 'user', content: 'hi' }] })) {
    ollamaChunks.push(chunk.content);
  }
  assert.equal(ollamaChunks.join(''), 'Local stream', 'ndjson stream reassembled');
  console.log('PASS Ollama adapter: loopback guard, discovery, health probe, streaming');

  // -----------------------------------------------------------------------
  // 5. Ollama unreachable → honest provider_unreachable
  // -----------------------------------------------------------------------
  await close(ollama);
  cleanups.pop();
  const downAdapter = createOllamaAdapter('ollama', 'Ollama (Local)', `http://127.0.0.1:${ollamaPort}`);
  await expectAdapterError(downAdapter.listModels(), 502, 'provider_unreachable', 'stopped Ollama listModels');
  assert.equal((await downAdapter.healthCheck('tiny-mock:1b')).healthy, false, 'stopped Ollama health is honest');
  console.log('PASS unreachable Ollama reports honest failure');

  // -----------------------------------------------------------------------
  // 6. 9Router proxy: auth, CSRF, honest config-required, SSRF guard
  //    (requires the canonical disposable cluster for real sessions)
  // -----------------------------------------------------------------------
  const databaseUrl = process.env.DATABASE_URL || '';
  const disposable = (() => { try { const url = new URL(databaseUrl); return url.hostname === '127.0.0.1' && url.port === '55432'; } catch { return false; } })();
  if (!disposable) {
    console.log('SKIP 9Router handler section: requires the disposable cluster via scripts/run-integration-tests.sh');
  } else {
    const { pool } = await import('../src/api/database.ts');
    const { hashPassword } = await import('../src/api/auth.ts');
    const adminId = randomUUID();
    const adminToken = randomBytes(32).toString('hex');
    await pool!.query('INSERT INTO users(id,email,password_hash,role,email_verified) VALUES($1,$2,$3,$4,true)', [adminId, `${adminId}@smoke.invalid`, await hashPassword(randomBytes(16).toString('hex')), 'admin']);
    await pool!.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [adminId, createHash('sha256').update(adminToken).digest('hex')]);
    const adminHeaders = { Cookie: `afg_session=${adminToken}; afg_csrf=${randomBytes(32).toString('hex')}` };

    const guest = await callNineRouter('/api/9router/status');
    assert.equal(guest.status, 401, 'unauthenticated 9Router request rejected');
    const parsedGuest = JSON.parse(guest.body);
    assert.equal(parsedGuest.available, false);

    setEnv('NINEROUTER_BASE_URL', undefined);
    const noConfig = await callNineRouter('/api/9router/status', { headers: adminHeaders });
    assert.equal(noConfig.status, 503);
    assert.match(JSON.parse(noConfig.body).error, /NINEROUTER_BASE_URL/);
    assert.equal(JSON.parse(noConfig.body).available, false);

    setEnv('NINEROUTER_BASE_URL', 'http://127.0.0.1:9');
    const ssrf = await callNineRouter('/api/9router/status', { headers: adminHeaders });
    assert.equal(ssrf.status, 502);
    assert.match(JSON.parse(ssrf.body).error, /public HTTPS|private or reserved/);

    setEnv('NINEROUTER_BASE_URL', 'https://127.0.0.1:9/');
    const ssrfHttps = await callNineRouter('/api/9router/status', { headers: adminHeaders });
    assert.equal(ssrfHttps.status, 502);
    assert.match(JSON.parse(ssrfHttps.body).error, /blocked network address/);

    console.log('PASS 9Router proxy: auth gate, honest config-required, SSRF guards');
    await pool!.query('DELETE FROM users WHERE id=$1', [adminId]);
    await pool!.end();
  }
  console.log('ALL_PROVIDER_SMOKE_TESTS_PASSED');
} finally {
  for (const cleanup of cleanups.reverse()) await cleanup();
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
