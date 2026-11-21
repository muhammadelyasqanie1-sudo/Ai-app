import assert from 'node:assert/strict';
import {
  parseChatPersistenceRequest,
  resolveChatPersistenceContext,
  persistAssistantMessage,
  failurePersistenceStatus,
  persistedStreamEvent,
} from '../src/api/chatPersistence.ts';

interface RecordedQuery { text: string; values: unknown[] }

function createFakeExecutor(responses: Record<string, { rows: Record<string, unknown>[] }[]> = {}) {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      const key = Object.keys(responses).find((pattern) => text.includes(pattern));
      const rows = key ? responses[key].shift()?.rows ?? [] : [];
      return { rows, rowCount: rows.length };
    },
  };
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// --- request parsing -------------------------------------------------------
assert.deepEqual(parseChatPersistenceRequest({}), {});
assert.deepEqual(parseChatPersistenceRequest({ conversationId: 'not-a-uuid' }), {});
assert.deepEqual(parseChatPersistenceRequest({ conversationId: UUID(1), clientMessageId: 'x', assistantClientMessageId: UUID(2) }), { conversationId: UUID(1), assistantClientMessageId: UUID(2) });
console.log('persistence request parsing rejects malformed ids.');

// --- conversation ownership ------------------------------------------------
{
  const executor = createFakeExecutor();
  const context = await resolveChatPersistenceContext(executor, 'user-1', { conversationId: UUID(1) }, { role: 'user', content: 'سلام' });
  assert.equal(context, null, 'conversation not owned by caller must disable persistence');
  assert.equal(executor.queries[0].values[1], 'user-1', 'ownership check is user-scoped');
}
{
  const executor = createFakeExecutor({ 'SELECT id FROM conversations': [{ rows: [{ id: UUID(1) }] }] });
  const context = await resolveChatPersistenceContext(executor, 'user-1', { conversationId: UUID(1), clientMessageId: UUID(2) }, { role: 'user', content: 'سلام' });
  assert.ok(context);
  assert.equal(context.assistantMessageId, null, 'no assistant id means only user-turn safety net');
  const insert = executor.queries[1];
  assert.match(insert.text, /INSERT INTO messages/);
  assert.equal(insert.values[0], UUID(2));
  assert.match(insert.text, /'user'/, 'role is bound as a literal in the safety-net insert');
  assert.equal(insert.values[2], 'سلام');
}
{
  const executor = createFakeExecutor({ 'SELECT id FROM conversations': [{ rows: [{ id: UUID(1) }] }] });
  const context = await resolveChatPersistenceContext(executor, 'user-1', { conversationId: UUID(1) }, { role: 'user', content: 'سلام' });
  assert.ok(context);
  assert.equal(executor.queries.length, 1, 'no user id -> no user-turn insert');
}
{
  const executor = createFakeExecutor({ 'SELECT id FROM conversations': [{ rows: [{ id: UUID(1) }] }] });
  const context = await resolveChatPersistenceContext(executor, 'user-1', { conversationId: UUID(1), clientMessageId: UUID(2) }, { role: 'assistant', content: 'hi' });
  assert.ok(context);
  assert.equal(executor.queries.length, 1, 'final message must be the user prompt to be stored');
}
console.log('persistence context is owner-scoped and stores the user turn idempotently.');

// --- assistant message persistence -----------------------------------------
{
  const executor = createFakeExecutor();
  const context = { conversationId: UUID(1), userMessageId: null, userMessageContent: '', assistantMessageId: UUID(3) };
  const result = await persistAssistantMessage(executor, context, '   ', 'complete', 'm');
  assert.equal(result.persisted, false, 'empty assistant content is never stored');
  assert.equal(executor.queries.length, 0);
}
{
  const executor = createFakeExecutor({ 'INSERT INTO messages': [{ rows: [{ id: UUID(3) }] }] });
  const context = { conversationId: UUID(1), userMessageId: null, userMessageContent: '', assistantMessageId: UUID(3) };
  const result = await persistAssistantMessage(executor, context, 'پاسخ نهایی', 'complete', '9router::gpt-4o');
  assert.equal(result.persisted, true);
  assert.equal(result.upgraded, false);
  assert.equal(result.status, 'complete');
  const insert = executor.queries[0];
  assert.match(insert.text, /'assistant'/, 'role is bound as a literal in the assistant insert');
  assert.equal(insert.values[2], 'پاسخ نهایی');
  assert.equal(insert.values[3], '9router::gpt-4o');
  assert.equal(insert.values[4], 'complete');
}
{
  // Retry success upgrades a cancelled partial row.
  const executor = createFakeExecutor({ 'UPDATE messages': [{ rows: [{ id: UUID(3) }] }] });
  const context = { conversationId: UUID(1), userMessageId: null, userMessageContent: '', assistantMessageId: UUID(3) };
  const result = await persistAssistantMessage(executor, context, 'full retry answer', 'complete', null);
  assert.equal(result.persisted, true);
  assert.equal(result.upgraded, true, 'a later successful attempt upgrades the partial row');
  const update = executor.queries[1];
  assert.match(update.text, /status <> 'complete'/, 'a complete row is never rewritten');
}
{
  // A complete row is authoritative: no downgrade, no rewrite.
  const executor = createFakeExecutor();
  const context = { conversationId: UUID(1), userMessageId: null, userMessageContent: '', assistantMessageId: UUID(3) };
  const result = await persistAssistantMessage(executor, context, 'duplicate write', 'complete', null);
  assert.equal(result.persisted, false, 'existing complete row blocks a diverging duplicate');
  assert.equal(executor.queries.length, 2, 'insert attempted, then guarded update, nothing else');
}
{
  // Content truncation to the messages table contract (50k chars).
  const executor = createFakeExecutor({ 'INSERT INTO messages': [{ rows: [{ id: UUID(3) }] }] });
  const context = { conversationId: UUID(1), userMessageId: null, userMessageContent: '', assistantMessageId: UUID(3) };
  await persistAssistantMessage(executor, context, 'x'.repeat(60_000), 'cancelled', 'm'.repeat(400));
  assert.equal((executor.queries[0].values[2] as string).length, 50_000, 'content truncated to the messages contract');
  assert.equal((executor.queries[0].values[3] as string).length, 300, 'model identifier truncated');
}
{
  // No context (guest / not owner) -> plain no-op.
  const executor = createFakeExecutor();
  const result = await persistAssistantMessage(executor, null, 'hello', 'complete', null);
  assert.equal(result.persisted, false);
  assert.equal(executor.queries.length, 0);
}
console.log('assistant persistence is idempotent, upgrade-only, truncating and guest-safe.');

// --- status mapping and stream event ---------------------------------------
assert.equal(failurePersistenceStatus(true, false), 'cancelled');
assert.equal(failurePersistenceStatus(false, true), 'cancelled');
assert.equal(failurePersistenceStatus(false, false), 'failed');
const event = persistedStreamEvent('req-1', 'assistant', { persisted: true, status: 'complete', messageId: UUID(3), upgraded: false });
assert.equal(event.type, 'persisted');
assert.equal(event.scope, 'assistant');
assert.equal(event.status, 'complete');
assert.equal(event.requestId, 'req-1');
console.log('failure status mapping and persisted stream event shape passed.');

console.log('Chat persistence regression suite passed.');
