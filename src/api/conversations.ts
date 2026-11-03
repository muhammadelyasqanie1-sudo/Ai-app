import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';

const createSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  model: z.string().trim().min(1).max(300).nullable().optional(),
  provider: z.string().trim().min(1).max(120).nullable().optional(),
}).strict();
const patchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  archived: z.boolean().optional(),
  model: z.string().trim().min(1).max(300).nullable().optional(),
  provider: z.string().trim().min(1).max(120).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
const messageSchema = z.object({
  role: z.enum(['user','assistant']),
  content: z.string().min(1).max(50_000),
  model: z.string().trim().min(1).max(300).nullable().optional(),
  status: z.enum(['complete','failed']).optional(),
  clientMessageId: z.string().uuid().optional(),
}).strict();

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) {
  const headerValue = res.getHeader('X-Request-Id');
  const requestId = typeof headerValue === 'string' ? headerValue : undefined;
  if (requestId) res.setHeader('X-Request-Id', requestId);
  sendAuthJson(res, status, { ...body, ...(requestId ? { requestId } : {}) });
}

async function safeReadBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown> | null> {
  try { return await readJsonBody(req, maxBytes); } catch { return null; }
}

/** Conversation and message CRUD. Every read/write is scoped to the authenticated owner. */
export async function handleConversationsApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/conversations')) return false;
  if (!pool) { reply(res,503,{error:'Conversation storage requires DATABASE_URL and database migrations.'}); return true; }
  const user = await authenticateRequest(req);
  if (!user) { reply(res,401,{error:'Sign in is required to access conversations.'}); return true; }
  if (!['GET','HEAD'].includes(req.method || 'GET') && !verifyCsrf(req)) {
    reply(res,403,{error:'CSRF validation failed.'}); return true;
  }

  if (pathname === '/api/conversations' && req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://localhost');
    const includeArchived = url.searchParams.get('archived') === 'true';
    const result = await pool.query(
      `SELECT c.id,c.title,c.model,c.provider,c.created_at AS "createdAt",c.updated_at AS "updatedAt",c.archived_at AS "archivedAt",
              (SELECT m.content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage"
         FROM conversations c WHERE c.user_id=$1 AND ($2::boolean OR c.archived_at IS NULL)
        ORDER BY c.updated_at DESC LIMIT 200`,
      [user.id,includeArchived],
    );
    reply(res,200,{conversations:result.rows}); return true;
  }

  if (pathname === '/api/conversations' && req.method === 'POST') {
    const raw = await safeReadBody(req,12_000);
    const parsed = raw ? createSchema.safeParse(raw) : null;
    if (!parsed?.success) { reply(res,400,{error:'Provide valid conversation details.'}); return true; }
    const result = await pool.query(
      `INSERT INTO conversations(user_id,title,model,provider) VALUES($1,$2,$3,$4)
       RETURNING id,title,model,provider,created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`,
      [user.id,parsed.data.title || 'New chat',parsed.data.model ?? null,parsed.data.provider ?? null],
    );
    reply(res,201,{conversation:result.rows[0]}); return true;
  }

  const match = pathname.match(/^\/api\/conversations\/([0-9a-f-]{36})(?:\/(messages)(?:\/([0-9a-f-]{36}))?)?$/i);
  if (!match) { reply(res,404,{error:'Conversation route not found.'}); return true; }
  const [,conversationId,subresource,messageId] = match;
  const owned = await pool.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 LIMIT 1',[conversationId,user.id]);
  if (!owned.rows.length) { reply(res,404,{error:'Conversation not found.'}); return true; }

  if (subresource === 'messages' && messageId && req.method === 'DELETE') {
    const deleted = await pool.query(
      `DELETE FROM messages m USING conversations c
        WHERE m.id=$1 AND m.conversation_id=c.id AND c.id=$2 AND c.user_id=$3
          AND m.role IN ('user','assistant')
        RETURNING m.id`,
      [messageId,conversationId,user.id],
    );
    if (!deleted.rows.length) { reply(res,404,{error:'Message not found.'}); return true; }
    await pool.query('UPDATE conversations SET updated_at=now() WHERE id=$1 AND user_id=$2',[conversationId,user.id]);
    reply(res,200,{deleted:true,id:messageId}); return true;
  }
  if (messageId) { reply(res,405,{error:'Method not allowed.'}); return true; }

  if (subresource === 'messages' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT id,role,content,model,status,created_at AS "createdAt"
         FROM messages WHERE conversation_id=$1 AND role IN ('user','assistant')
        ORDER BY created_at ASC LIMIT 1000`,
      [conversationId],
    );
    reply(res,200,{messages:result.rows}); return true;
  }
  if (subresource === 'messages' && req.method === 'POST') {
    const raw = await safeReadBody(req,60_000);
    const parsed = raw ? messageSchema.safeParse(raw) : null;
    if (!parsed?.success) { reply(res,400,{error:'Provide a valid user or assistant message.'}); return true; }
    const client = await pool.connect();
    let savedMessage;
    let created = true;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO messages(id,conversation_id,role,content,model,status)
         VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id,role,content,model,status,created_at AS "createdAt"`,
        [parsed.data.clientMessageId ?? null,conversationId,parsed.data.role,parsed.data.content,parsed.data.model ?? null,parsed.data.status || 'complete'],
      );
      if (result.rows.length) {
        savedMessage = result.rows[0];
      } else if (parsed.data.clientMessageId) {
        const existing = await client.query(
          `SELECT id,role,content,model,status,created_at AS "createdAt"
             FROM messages
            WHERE id=$1 AND conversation_id=$2
            LIMIT 1`,
          [parsed.data.clientMessageId,conversationId],
        );
        const previous = existing.rows[0];
        if (!previous) {
          await client.query('ROLLBACK');
          reply(res,409,{error:'This message ID is already in use.'});
          return true;
        }
        const samePayload = previous.role === parsed.data.role &&
          previous.content === parsed.data.content &&
          previous.model === (parsed.data.model ?? null) &&
          previous.status === (parsed.data.status || 'complete');
        if (!samePayload) {
          await client.query('ROLLBACK');
          reply(res,409,{error:'This message ID was already used for different message content.'});
          return true;
        }
        savedMessage = previous;
        created = false;
      } else {
        throw new Error('Message insert returned no row without an idempotency key.');
      }
      if (created) {
        await client.query('UPDATE conversations SET updated_at=now() WHERE id=$1 AND user_id=$2',[conversationId,user.id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    reply(res,created ? 201 : 200,{message:savedMessage,duplicate:!created}); return true;
  }
  if (subresource) { reply(res,405,{error:'Method not allowed.'}); return true; }

  if (req.method === 'GET') {
    const result = await pool.query(
      `SELECT id,title,model,provider,created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"
         FROM conversations WHERE id=$1 AND user_id=$2`,
      [conversationId,user.id],
    );
    reply(res,200,{conversation:result.rows[0]}); return true;
  }
  if (req.method === 'PATCH') {
    const raw = await safeReadBody(req,12_000);
    const parsed = raw ? patchSchema.safeParse(raw) : null;
    if (!parsed?.success) { reply(res,400,{error:'Provide valid conversation updates.'}); return true; }
    const value = parsed.data;
    const result = await pool.query(
      `UPDATE conversations SET
         title=COALESCE($3,title), model=CASE WHEN $4::boolean THEN $5 ELSE model END,
         provider=CASE WHEN $6::boolean THEN $7 ELSE provider END,
         archived_at=CASE WHEN $8::boolean THEN CASE WHEN $9::boolean THEN COALESCE(archived_at,now()) ELSE NULL END ELSE archived_at END,
         updated_at=now()
       WHERE id=$1 AND user_id=$2
       RETURNING id,title,model,provider,created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`,
      [conversationId,user.id,value.title ?? null,Object.prototype.hasOwnProperty.call(value,'model'),value.model ?? null,
       Object.prototype.hasOwnProperty.call(value,'provider'),value.provider ?? null,Object.prototype.hasOwnProperty.call(value,'archived'),Boolean(value.archived)],
    );
    reply(res,200,{conversation:result.rows[0]}); return true;
  }
  if (req.method === 'DELETE') {
    await pool.query('DELETE FROM conversations WHERE id=$1 AND user_id=$2',[conversationId,user.id]);
    reply(res,200,{deleted:true,id:conversationId}); return true;
  }
  reply(res,405,{error:'Method not allowed.'}); return true;
}
