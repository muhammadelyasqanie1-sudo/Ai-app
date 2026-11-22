import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { pool, checkDatabase } from '../src/api/database.ts';
import { handleAuthApi, hashPassword } from '../src/api/auth.ts';
import { handleConversationsApi } from '../src/api/conversations.ts';
import {
  resolveChatPersistenceContext,
  persistAssistantMessage,
  failurePersistenceStatus,
} from '../src/api/chatPersistence.ts';
// Refuse all non-disposable database targets; tests create and remove synthetic users.
const target = new URL(process.env.DATABASE_URL || '');
assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '55432');

const ids: string[] = [];
const server = createServer((req, res) => { void (req.url!.startsWith('/api/auth/') ? handleAuthApi(req, res, new URL(req.url!, 'http://local').pathname) : handleConversationsApi(req, res, new URL(req.url!, 'http://local').pathname)).catch(() => { res.statusCode = 500; res.end(); }); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as { port: number };
const csrf = randomBytes(24).toString('hex');
const call = (path: string, token: string, method = 'GET', body?: unknown, withCsrf = true) => fetch(`http://127.0.0.1:${address.port}/api/conversations${path}`, { method, headers: { Cookie: `afg_session=${token}; afg_csrf=${csrf}`, ...(withCsrf ? { 'X-CSRF-Token': csrf } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

try {
  assert.equal((await checkDatabase()).schemaReady, true);
  const password = randomBytes(24).toString('hex');
  const passwordHash = await hashPassword(password);
  const userId = randomUUID(); ids.push(userId);
  const token = randomBytes(32).toString('hex');
  await pool!.query('INSERT INTO users(id,email,password_hash,email_verified) VALUES($1,$2,$3,true)', [userId, `${userId}@example.invalid`, passwordHash]);
  await pool!.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [userId, createHash('sha256').update(token).digest('hex')]);
  const login = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${userId}@example.invalid`, password }) });
  assert.equal(login.status, 200);

  // The client creates the conversation and stores the user turn (existing flow).
  const created = await call('', token, 'POST', { title: 'Phase 3 persistence' }); assert.equal(created.status, 201);
  const conversationId = (await created.json()).conversation.id;
  const userMessageId = randomUUID();
  const assistantMessageId = randomUUID();
  assert.equal((await call(`/${conversationId}/messages`, token, 'POST', { role: 'user', content: 'یک پرسش آزمایشی', clientMessageId: userMessageId })).status, 201);

  // 1. The chat handler resolves the persistence context for the owner.
  const context = await resolveChatPersistenceContext(pool!, userId, { conversationId, clientMessageId: userMessageId, assistantClientMessageId: assistantMessageId }, { role: 'user', content: 'یک پرسش آزمایشی' });
  assert.ok(context, 'owner gets a persistence context');
  assert.equal(context.assistantMessageId, assistantMessageId);

  // 2. The user-turn safety net is a no-op when the client already stored it.
  const before = await pool!.query('SELECT count(*)::int AS count FROM messages WHERE conversation_id=$1', [conversationId]);
  assert.equal(before.rows[0].count, 1, 'idempotent user-turn insert must not duplicate');

  // 3. A foreign user (or guest) never gains persistence access.
  const foreignUserId = randomUUID(); ids.push(foreignUserId);
  await pool!.query('INSERT INTO users(id,email,password_hash,email_verified) VALUES($1,$2,$3,true)', [foreignUserId, `${foreignUserId}@example.invalid`, passwordHash]);
  const foreignContext = await resolveChatPersistenceContext(pool!, foreignUserId, { conversationId, assistantClientMessageId: randomUUID() }, { role: 'user', content: 'intrusion' });
  assert.equal(foreignContext, null, 'non-owner must not persist into a foreign conversation');

  // 4. Interrupted stream: partial reply is stored as 'cancelled' (what used to be lost forever).
  const partial = 'پاسخ نیمه‌کاره که قبلاً با قطع اتصال از دست می‌رفت';
  const cancelled = await persistAssistantMessage(pool!, context, partial, failurePersistenceStatus(true, false), '9router::test-model');
  assert.equal(cancelled.persisted, true);
  assert.equal(cancelled.status, 'cancelled');

  // 5. A client retry that succeeds upgrades the partial row to 'complete'.
  const upgraded = await persistAssistantMessage(pool!, context, 'پاسخ کامل پس از تلاش مجدد', 'complete', '9router::test-model');
  assert.equal(upgraded.persisted, true); assert.equal(upgraded.upgraded, true);
  const stored = await pool!.query('SELECT content,status,model FROM messages WHERE id=$1', [assistantMessageId]);
  assert.equal(stored.rows[0].status, 'complete');
  assert.equal(stored.rows[0].content, 'پاسخ کامل پس از تلاش مجدد');

  // 6. A complete row is authoritative: later writes cannot rewrite it.
  const blocked = await persistAssistantMessage(pool!, context, 'متن متفاوت', 'failed', null);
  assert.equal(blocked.persisted, false, 'complete rows are never downgraded');
  const after = await pool!.query('SELECT content,status FROM messages WHERE id=$1', [assistantMessageId]);
  assert.equal(after.rows[0].status, 'complete');
  assert.equal(after.rows[0].content, 'پاسخ کامل پس از تلاش مجدد');

  // 7. The client-facing history endpoint sees exactly two turns, in order.
  const history = await (await call(`/${conversationId}/messages`, token)).json();
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[0].role, 'user');
  assert.equal(history.messages[1].role, 'assistant');
  assert.equal(history.messages[1].status, 'complete');

  // 8. Empty replies are never persisted.
  const empty = await persistAssistantMessage(pool!, context, '   ', 'complete', null);
  assert.equal(empty.persisted, false);
  const finalCount = await pool!.query('SELECT count(*)::int AS count FROM messages WHERE conversation_id=$1', [conversationId]);
  assert.equal(finalCount.rows[0].count, 2);

  console.log('Phase 3 server-side persistence integration tests passed (ownership, safety net, cancelled->complete upgrade, no-downgrade, history, empty guard).');
} finally {
  await pool!.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await pool!.end();
}
