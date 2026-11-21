/**
 * Server-side chat message persistence (Phase 3 of the completion plan).
 *
 * Until now the chat handler streamed the assistant reply to the client and
 * relied on the client to POST both turns to /api/conversations. A closed tab
 * or a dropped connection therefore lost the assistant response permanently.
 * These helpers let the chat handler store both turns itself:
 *
 *  - Ownership of the conversation is re-verified server-side; guests and
 *    callers who do not own the conversation simply get no persistence.
 *  - Every write is idempotent: the client-generated message UUID is the
 *    primary key, so a client that also persists the same turn (old flow)
 *    can never create a duplicate row.
 *  - A later retry attempt may upgrade a partial 'cancelled'/'failed' row to
 *    'complete', but a 'complete' row is never downgraded or rewritten.
 */

export type ChatPersistenceStatus = 'complete' | 'failed' | 'cancelled';

export interface ChatPersistenceExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export interface ChatPersistenceRequest {
  conversationId?: string;
  clientMessageId?: string;
  assistantClientMessageId?: string;
}

export interface ChatPersistenceContext {
  conversationId: string;
  userMessageId: string | null;
  userMessageContent: string;
  assistantMessageId: string | null;
}

export interface PersistedMessageResult {
  persisted: boolean;
  status: ChatPersistenceStatus;
  messageId: string | null;
  /** True when an existing partial row (cancelled/failed) was upgraded to the new payload. */
  upgraded: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PERSISTED_CONTENT = 50_000;
const MAX_PERSISTED_MODEL = 300;

export function isValidPersistenceUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function parseChatPersistenceRequest(body: Record<string, unknown>): ChatPersistenceRequest {
  const request: ChatPersistenceRequest = {};
  if (isValidPersistenceUuid(body.conversationId)) request.conversationId = body.conversationId;
  if (isValidPersistenceUuid(body.clientMessageId)) request.clientMessageId = body.clientMessageId;
  if (isValidPersistenceUuid(body.assistantClientMessageId)) request.assistantClientMessageId = body.assistantClientMessageId;
  return request;
}

/**
 * Verify that the caller owns the conversation and store the final user
 * message as a safety net (no-op when the client already persisted it).
 * Returns null when persistence must not happen (guest, not owner, no ids).
 */
export async function resolveChatPersistenceContext(
  executor: ChatPersistenceExecutor,
  userId: string,
  request: ChatPersistenceRequest,
  finalUserMessage: { role: string; content: string } | undefined,
): Promise<ChatPersistenceContext | null> {
  if (!request.conversationId) return null;
  const owned = await executor.query(
    'SELECT id FROM conversations WHERE id=$1 AND user_id=$2 LIMIT 1',
    [request.conversationId, userId],
  );
  if (!owned.rows.length) return null;
  const userMessageId = request.clientMessageId ?? null;
  const userMessageContent = finalUserMessage && finalUserMessage.role === 'user'
    ? String(finalUserMessage.content || '').slice(0, MAX_PERSISTED_CONTENT)
    : '';
  if (userMessageId && userMessageContent.trim()) {
    await executor.query(
      `INSERT INTO messages(id,conversation_id,role,content,status)
       VALUES($1,$2,'user',$3,'complete')
       ON CONFLICT (id) DO NOTHING`,
      [userMessageId, request.conversationId, userMessageContent],
    );
  }
  return {
    conversationId: request.conversationId,
    userMessageId,
    userMessageContent,
    assistantMessageId: request.assistantClientMessageId ?? null,
  };
}

/**
 * Store (or upgrade) the assistant reply for the conversation. Returns a
 * result the caller can forward to the client as a `persisted` stream event.
 */
export async function persistAssistantMessage(
  executor: ChatPersistenceExecutor,
  context: ChatPersistenceContext | null,
  content: string,
  status: ChatPersistenceStatus,
  model: string | null,
): Promise<PersistedMessageResult> {
  const nothing: PersistedMessageResult = { persisted: false, status, messageId: null, upgraded: false };
  if (!context || !context.assistantMessageId) return nothing;
  const trimmed = String(content || '').trim();
  if (!trimmed) return nothing;
  const storedContent = trimmed.slice(0, MAX_PERSISTED_CONTENT);
  const storedModel = model ? String(model).slice(0, MAX_PERSISTED_MODEL) : null;

  const inserted = await executor.query(
    `INSERT INTO messages(id,conversation_id,role,content,model,status)
     VALUES($1,$2,'assistant',$3,$4,$5)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [context.assistantMessageId, context.conversationId, storedContent, storedModel, status],
  );
  if (inserted.rows.length) {
    return { persisted: true, status, messageId: String(inserted.rows[0].id), upgraded: false };
  }
  // The row already exists: a previous attempt stored a partial reply. Only
  // upgrade it; a 'complete' row is authoritative and must never be rewritten.
  const upgraded = await executor.query(
    `UPDATE messages SET content=$3, model=$4, status=$5
      WHERE id=$1 AND conversation_id=$2 AND status <> 'complete'
      RETURNING id`,
    [context.assistantMessageId, context.conversationId, storedContent, storedModel, status],
  );
  if (upgraded.rows.length) {
    return { persisted: true, status, messageId: String(upgraded.rows[0].id), upgraded: true };
  }
  return nothing;
}

/** Server-side status for a stream that ended without a normal completion. */
export function failurePersistenceStatus(abortControllerSignalAborted: boolean, timedOut: boolean): ChatPersistenceStatus {
  return abortControllerSignalAborted || timedOut ? 'cancelled' : 'failed';
}

/** Build the SSE payload forwarded to the client after a successful persist. */
export function persistedStreamEvent(
  requestId: string,
  scope: 'assistant',
  result: PersistedMessageResult,
): Record<string, unknown> {
  return { type: 'persisted', requestId, scope, messageId: result.messageId, status: result.status };
}