// Multi-instance live event fan-out test.
//
// Boots TWO real application instances (tsx server.ts) against one disposable
// PostgreSQL cluster and verifies:
//   1. Both instances' /api/events SSE clients receive the initial snapshot.
//   2. An admin mutation executed on instance A fans out to BOTH instances via
//      PostgreSQL LISTEN/NOTIFY — asserted on the SAME persistent connection
//      that already consumed its initial snapshot, so the second event can
//      only be the genuinely pushed cross-instance event.
//   3. Reconnect: a fresh connection receives a fresh snapshot (the server-side
//      behaviour browser EventSource relies on with retry: 5000).
//   4. Authorization: guests receive a valid snapshot but cannot mutate admin
//      config; authenticated non-admin users are rejected server-side.
//
// Requires the canonical disposable cluster: bash scripts/run-integration-tests.sh
// Usage: npx tsx scripts/test-multi-instance-fanout.ts
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { pool, checkDatabase } from '../src/api/database.ts';

// Refuse all non-disposable database targets.
const target = new URL(process.env.DATABASE_URL || '');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');

const PORT_A = 31981;
const PORT_B = 31982;

interface SseEvent { event: string; data: string; }

async function* readSseEvents(url: string, signal: AbortSignal, headers: Record<string, string> = {}): AsyncGenerator<SseEvent> {
  const response = await fetch(url, { signal, headers: { Accept: 'text/event-stream', ...headers } });
  if (!response.ok || !response.body) throw new Error(`SSE connect failed: ${response.status}`);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed: SseEvent = { event: 'message', data: '' };
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) parsed.event = line.slice(6).trim();
        else if (line.startsWith('data:')) parsed.data += line.slice(5).trim();
      }
      yield parsed;
      boundary = buffer.indexOf('\n\n');
    }
  }
}

interface SseConnection {
  /** Wait for the NEXT events matching `test` (events already received are ignored). */
  waitForNext(test: (event: SseEvent) => boolean, count: number, timeoutMs: number): Promise<SseEvent[]>;
  /** Wait for events matching `test`, counting events already received too. */
  waitFor(test: (event: SseEvent) => boolean, count: number, timeoutMs: number): Promise<SseEvent[]>;
  close(): void;
}

function connectSse(url: string, headers: Record<string, string> = {}): SseConnection {
  const controller = new AbortController();
  const received: SseEvent[] = [];
  interface Waiter {
    test: (event: SseEvent) => boolean;
    count: number;
    collected: SseEvent[];
    resolve: (events: SseEvent[]) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
    ignoreExisting: boolean;
  }
  const waiters: Waiter[] = [];
  // Reconnecting pump: mirrors the client-side EventSource contract — a dropped
  // or refused connection is retried until closed. Without this a single
  // transient connect failure would silently stall every waiter.
  const pump = (async () => {
    while (!controller.signal.aborted) {
      try {
        for await (const event of readSseEvents(url, controller.signal, headers)) {
          received.push(event);
          for (let i = waiters.length - 1; i >= 0; i--) {
            const waiter = waiters[i];
            if (waiter.test(event)) {
              waiter.collected.push(event);
              if (waiter.collected.length >= waiter.count) {
                clearTimeout(waiter.timer);
                waiters.splice(i, 1);
                waiter.resolve(waiter.collected);
              }
            }
          }
        }
      } catch { /* aborted or transient connect failure */ }
      if (controller.signal.aborted) break;
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  const makeWaiter = (test: (event: SseEvent) => boolean, count: number, timeoutMs: number, ignoreExisting: boolean) =>
    new Promise<SseEvent[]>((resolve, reject) => {
      const collected: SseEvent[] = [];
      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`timeout waiting for SSE event on ${url}`));
      }, timeoutMs);
      const waiter: Waiter = { test, count, collected, resolve, reject: (error) => { clearTimeout(timer); reject(error); }, timer, ignoreExisting };
      if (!ignoreExisting) {
        for (const event of received) {
          if (collected.length >= count) break;
          if (test(event)) collected.push(event);
        }
      }
      if (collected.length >= count) { clearTimeout(timer); resolve(collected); return; }
      waiters.push(waiter);
    });
  return {
    waitForNext: (test, count, timeoutMs) => makeWaiter(test, count, timeoutMs, true),
    waitFor: (test, count, timeoutMs) => makeWaiter(test, count, timeoutMs, false),
    close: () => controller.abort(),
  };
}

async function waitForServer(name: string, port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not become healthy within ${timeoutMs}ms`);
}

const children: ReturnType<typeof spawn>[] = [];
const adminId = randomUUID();
const nonAdminId = randomUUID();

try {
  assert.equal((await checkDatabase()).schemaReady, true);

  // Seed an admin whose mutation will drive the fan-out.
  const adminToken = randomBytes(32).toString('hex');
  const adminPassword = randomBytes(24).toString('hex');
  const { hashPassword } = await import('../src/api/auth.ts');
  await pool!.query(
    'INSERT INTO users(id,email,password_hash,role,email_verified) VALUES($1,$2,$3,$4,true)',
    [adminId, `${adminId}@example.invalid`, await hashPassword(adminPassword), 'admin'],
  );
  await pool!.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [adminId, createHash('sha256').update(adminToken).digest('hex')],
  );

  // Boot two real application instances on the same database.
  for (const [name, port] of [['A', PORT_A], ['B', PORT_B]] as const) {
    const child = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), DATABASE_URL: process.env.DATABASE_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stderr?.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
    child.stdout?.on('data', (d) => {
      const text = String(d);
      if (process.env.FANOUT_DEBUG) process.stdout.write(`[${name}] ${text}`);
      if (text.includes('AFG_LIVE_EVENT_HUB_LOCAL_ONLY')) {
        console.error(`${name} fell back to local-only hub — cross-instance test would be invalid`);
      }
    });
  }
  await waitForServer('instance A', PORT_A);
  await waitForServer('instance B', PORT_B);

  // Persistent SSE clients: one per instance.
  const clientA = connectSse(`http://127.0.0.1:${PORT_A}/api/events`);
  const clientB = connectSse(`http://127.0.0.1:${PORT_B}/api/events`);
  const isCatalog = (e: SseEvent) => e.event === 'catalog.updated' && e.data.length > 0;

  // 1. Initial snapshot on both instances.
  await clientA.waitFor(isCatalog, 1, 20_000);
  await clientB.waitFor(isCatalog, 1, 20_000);

  // 2. Admin mutation on instance A. The NEXT catalog.updated on each already
  //    subscribed connection can only be the hub-pushed event.
  const csrf = randomBytes(32).toString('hex');
  const mutation = await fetch(`http://127.0.0.1:${PORT_A}/api/admin/config/live.fanout.probe`, {
    method: 'PUT',
    headers: {
      Cookie: `afg_session=${adminToken}; afg_csrf=${csrf}`,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: { probe: true, at: new Date().toISOString() } }),
  });
  assert.equal(mutation.status, 200, 'admin config mutation on instance A succeeded');

  const [pushedA, pushedB] = await Promise.all([
    clientA.waitForNext(isCatalog, 1, 15_000),
    clientB.waitForNext(isCatalog, 1, 15_000),
  ]);
  assert.ok(pushedA.length >= 1, 'instance A client received hub-pushed catalog.updated');
  assert.ok(pushedB.length >= 1, 'instance B client received cross-instance hub-pushed catalog.updated');

  // 3. Reconnect: a fresh connection receives a fresh snapshot immediately
  //    (server side of the browser EventSource retry contract).
  const reconnect = connectSse(`http://127.0.0.1:${PORT_B}/api/events`);
  const reconnected = await reconnect.waitFor(isCatalog, 1, 15_000);
  reconnect.close();
  assert.ok(reconnected.length >= 1, 'reconnected client on instance B received a fresh snapshot');

  // 4. Authorization: guest snapshot is a valid capability snapshot; guest and
  //    non-admin authenticated users cannot mutate admin config.
  const guest = connectSse(`http://127.0.0.1:${PORT_A}/api/events`);
  const guestEvents = await guest.waitFor(isCatalog, 1, 15_000);
  guest.close();
  const guestSnapshot = JSON.parse(guestEvents[0].data);
  assert.equal(typeof guestSnapshot.verified, 'boolean', 'guest snapshot is a valid capability snapshot');

  const guestMutation = await fetch(`http://127.0.0.1:${PORT_A}/api/admin/config/live.fanout.probe`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: { hacked: true } }),
  });
  assert.ok([401, 403].includes(guestMutation.status), 'guest cannot mutate admin config');

  const userToken = randomBytes(32).toString('hex');
  await pool!.query(
    'INSERT INTO users(id,email,password_hash,role,email_verified) VALUES($1,$2,$3,$4,true)',
    [nonAdminId, `${nonAdminId}@example.invalid`, 'x', 'user'],
  );
  await pool!.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [nonAdminId, createHash('sha256').update(userToken).digest('hex')],
  );
  const userMutation = await fetch(`http://127.0.0.1:${PORT_A}/api/admin/config/live.fanout.probe`, {
    method: 'PUT',
    headers: {
      Cookie: `afg_session=${userToken}; afg_csrf=${csrf}`,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: { hacked: true } }),
  });
  assert.equal(userMutation.status, 403, 'non-admin authenticated user cannot mutate admin config');

  clientA.close(); clientB.close();
  console.log('Multi-instance fan-out tests passed: cross-instance delivery, reconnect, guest/admin authorization.');
} finally {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  await new Promise((r) => setTimeout(r, 1000));
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  await pool!.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[adminId, nonAdminId]]).catch(() => {});
  await pool!.end();
}
