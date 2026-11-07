import type { IncomingMessage, ServerResponse } from 'http';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { prepareVerifiedChat } from '../services/chatService.ts';
import { enforceModelSubscription } from './modelAccess.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';
import { buildPersonalContextMessage } from '../services/intelligenceContext.ts';
import { buildProfessionalCapabilityPrompt } from '../services/afgProfessionalStandard.ts';

const requestSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  clientMessageId: z.string().uuid(),
  content: z.string().trim().min(1).max(50_000),
  model: z.string().trim().min(1).max(300).default('auto'),
  priority: z.enum(['balanced']).default('balanced'),
}).strict();

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  sendAuthJson(res, status, body);
}

function sse(res: ServerResponse, event: Record<string, unknown>) {
  if (!res.writableEnded && !res.destroyed) res.write('data: ' + JSON.stringify(event) + '\n\n');
}

async function enforceGatewayModelLimit(userId: string, providerId: string, modelId: string) {
  if (!pool) return;
  const key = providerId + '::' + modelId;
  const configured = await pool.query(
    "SELECT requests,window_seconds FROM rate_limit_policies WHERE enabled=true AND scope_type='model' AND scope_key=$1 LIMIT 1",
    [key],
  );
  const policy = configured.rows[0] || { requests: 60, window_seconds: 60 };
  const max = Math.max(1, Number(policy.requests) || 60);
  const seconds = Math.max(1, Number(policy.window_seconds) || 60);
  const result = await pool.query(
    `INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
     VALUES('model',$1,to_timestamp((floor(extract(epoch FROM now())/$2)*$2)::double precision),1)
     ON CONFLICT(scope_type,scope_key,window_start)
     DO UPDATE SET request_count=rate_limit_counters.request_count+1
     RETURNING request_count`,
    [key, seconds],
  );
  if (Number(result.rows[0]?.request_count || 0) > max) {
    throw new ProviderAdapterError('This model is temporarily rate limited. Please retry later.', 429, 'model_rate_limited');
  }
  // User is intentionally included in structured audit metadata only; the shared model
  // counter matches the existing /api/chat policy semantics.
  void userId;
}

export async function handlePersonalGatewayApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  requestId: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/gateway/')) return false;
  if (pathname !== '/api/gateway/chat' || req.method !== 'POST') {
    json(res, 404, { error: 'Gateway route not found.', requestId });
    return true;
  }
  if (!pool) {
    json(res, 503, { error: 'The Personal AI Gateway requires DATABASE_URL and applied database migrations.', requestId });
    return true;
  }
  if (!verifyCsrf(req)) {
    json(res, 403, { error: 'CSRF validation failed.', requestId });
    return true;
  }
  const user = await authenticateRequest(req);
  if (!user) {
    json(res, 401, { error: 'Sign in to AFG AI before using the Personal AI Gateway.', requestId });
    return true;
  }

  let raw: Record<string, unknown>;
  try {
    raw = await readJsonBody(req, 60_000);
  } catch {
    json(res, 400, { error: 'Provide a valid JSON gateway request.', requestId });
    return true;
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    json(res, 400, { error: 'Provide a valid conversationId, clientMessageId and message content.', requestId });
    return true;
  }

  const input = parsed.data;
  const model = input.model || 'auto';
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ conversationId: input.conversationId ?? null, content: input.content, model, priority: input.priority }))
    .digest('hex');
  const client = await pool.connect();
  let conversationId = input.conversationId ?? null;
  let replayText: string | null = null;
  let replayModel: string | null = null;
  let replayProvider: string | null = null;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['afg-gateway-request:' + user.id + ':' + input.clientMessageId]);
    const prior = await client.query(
      `SELECT conversation_id,payload_hash,status,response_text,provider_key,model_key
         FROM personal_gateway_requests
        WHERE user_id=$1 AND client_message_id=$2
        FOR UPDATE`,
      [user.id, input.clientMessageId],
    );
    if (prior.rows.length) {
      const row = prior.rows[0];
      if (String(row.payload_hash).trim() !== payloadHash) {
        await client.query('ROLLBACK');
        json(res, 409, { error: 'clientMessageId was already used with different request content.', requestId });
        return true;
      }
      conversationId = String(row.conversation_id);
      if (row.status === 'completed' && typeof row.response_text === 'string') {
        replayText = row.response_text;
        replayModel = row.model_key ? String(row.model_key) : null;
        replayProvider = row.provider_key ? String(row.provider_key) : null;
        await client.query('COMMIT');
      } else if (row.status === 'processing') {
        await client.query('ROLLBACK');
        json(res, 409, { error: 'This message is already being processed.', retryable: true, conversationId, requestId });
        return true;
      } else {
        await client.query(
          `UPDATE personal_gateway_requests SET status='processing',error_code=NULL,updated_at=now()
            WHERE user_id=$1 AND client_message_id=$2`,
          [user.id, input.clientMessageId],
        );
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['afg-gateway-conversation:' + conversationId]);
        await client.query('COMMIT');
      }
    } else {
      if (conversationId) {
        const owned = await client.query(
          'SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [conversationId, user.id],
        );
        if (!owned.rows.length) {
          await client.query('ROLLBACK');
          json(res, 404, { error: 'Conversation not found.', requestId });
          return true;
        }
      } else {
        const created = await client.query(
          `INSERT INTO conversations(user_id,title,model,provider)
           VALUES($1,$2,$3,NULL)
           RETURNING id`,
          [user.id, input.content.slice(0, 72) || 'New chat', model],
        );
        conversationId = String(created.rows[0].id);
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['afg-gateway-conversation:' + conversationId]);
      await client.query(
        `INSERT INTO messages(id,conversation_id,role,content,model,status)
         VALUES($1,$2,'user',$3,$4,'complete')`,
        [input.clientMessageId, conversationId, input.content, model],
      );
      await client.query(
        `INSERT INTO personal_gateway_requests(user_id,conversation_id,client_message_id,payload_hash,status)
         VALUES($1,$2,$3,$4,'processing')`,
        [user.id, conversationId, input.clientMessageId, payloadHash],
      );
      await client.query('UPDATE conversations SET updated_at=now() WHERE id=$1 AND user_id=$2', [conversationId, user.id]);
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('AFG_PERSONAL_GATEWAY_PERSIST_FAILED', JSON.stringify({ requestId, userId: user.id }));
    json(res, 503, { error: 'The gateway could not safely save this message. Please retry with the same clientMessageId.', retryable: true, requestId });
    return true;
  } finally {
    client.release();
  }

  if (replayText !== null) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Request-Id': requestId });
    sse(res, { type: 'meta', requestId, conversationId, replayed: true, ...(replayProvider && replayModel ? { modelId: replayProvider + '::' + replayModel } : {}) });
    sse(res, { type: 'content', text: replayText });
    sse(res, { type: 'done', requestId, conversationId, replayed: true });
    res.end();
    return true;
  }

  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  let selectedProvider = '';
  let selectedModel = '';
  let output = '';
  try {
    const history = await pool.query(
      `SELECT role,content FROM (
         SELECT role,content,created_at,id FROM messages
          WHERE conversation_id=$1 AND role IN ('user','assistant')
          ORDER BY created_at DESC,id DESC LIMIT 30
       ) recent ORDER BY created_at ASC,id ASC`,
      [conversationId],
    );
    const personalContext = await buildPersonalContextMessage(user.id, input.content);
    const conversationMessages = history.rows.map((row: any) => ({ role: row.role, content: String(row.content) }));
    conversationMessages.unshift({ role: 'system', content: buildProfessionalCapabilityPrompt(input.content) });
    if (personalContext) conversationMessages.unshift({ role: 'system', content: personalContext });
    const prepared = await prepareVerifiedChat({
      model,
      messages: conversationMessages,
      signal: abort.signal,
      onModelSelected: async (providerId, modelId) => {
        await enforceModelSubscription(user.id, providerId, modelId);
        await enforceGatewayModelLimit(user.id, providerId, modelId);
        selectedProvider = providerId;
        selectedModel = modelId;
      },
    });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    });
    sse(res, { type: 'meta', requestId, conversationId, modelId: prepared.providerId + '::' + prepared.modelId });
    for await (const chunk of prepared.stream) {
      if (!chunk.content) continue;
      output += chunk.content;
      sse(res, { type: 'content', text: chunk.content });
    }
    if (!output) throw new ProviderAdapterError('The provider returned an empty response.', 502, 'empty_response');

    const save = await pool.connect();
    try {
      await save.query('BEGIN');
      await save.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['afg-gateway-conversation:' + conversationId]);
      const assistantId = randomUUID();
      await save.query(
        `INSERT INTO messages(id,conversation_id,role,content,model,status)
         VALUES($1,$2,'assistant',$3,$4,'complete')`,
        [assistantId, conversationId, output, selectedProvider && selectedModel ? selectedProvider + '::' + selectedModel : model],
      );
      await save.query(
        `UPDATE personal_gateway_requests
            SET status='completed',response_text=$3,provider_key=$4,model_key=$5,
                assistant_message_id=$6,error_code=NULL,updated_at=now(),completed_at=now()
          WHERE user_id=$1 AND client_message_id=$2`,
        [user.id, input.clientMessageId, output, selectedProvider || null, selectedModel || null, assistantId],
      );
      await save.query(
        'UPDATE conversations SET model=$2,provider=$3,updated_at=now() WHERE id=$1 AND user_id=$4',
        [conversationId, selectedProvider && selectedModel ? selectedProvider + '::' + selectedModel : model, selectedProvider || null, user.id],
      );
      await save.query('COMMIT');
    } catch (error) {
      await save.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      save.release();
    }
    sse(res, { type: 'done', requestId, conversationId });
    res.end();
  } catch (error) {
    await pool.query(
      `UPDATE personal_gateway_requests SET status='failed',error_code=$3,updated_at=now()
        WHERE user_id=$1 AND client_message_id=$2`,
      [user.id, input.clientMessageId, error instanceof ProviderAdapterError ? error.code.slice(0, 64) : 'gateway_failed'],
    ).catch(() => {});
    console.error('AFG_PERSONAL_GATEWAY_GENERATION_FAILED', JSON.stringify({
      requestId, userId: user.id, provider: selectedProvider || null, model: selectedModel || null,
      code: error instanceof ProviderAdapterError ? error.code : 'gateway_failed',
    }));
    if (!res.headersSent) {
      const status = error instanceof ProviderAdapterError && error.status >= 400 && error.status < 500 ? error.status : 502;
      json(res, status, { error: 'The AI request failed. Your message is saved; retry with the same clientMessageId.', retryable: true, conversationId, requestId });
    } else {
      sse(res, { type: 'error', error: 'The response was interrupted. Your message is saved; retry with the same clientMessageId.', retryable: true, conversationId, requestId });
      res.end();
    }
  }
  return true;
}
