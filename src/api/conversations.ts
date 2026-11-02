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
}).strict();

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) {
  sendAuthJson(res, status, body);
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
    const parsed = createSchema.safeParse(await readJsonBody(req,12_000));
    if (!parsed.success) { reply(res,400,{error:'Provide valid conversation details.'}); return true; }
    const result = await pool.query(
      `INSERT INTO conversations(user_id,title,model,provider) VALUES($1,$2,$3,$4)
       RETURNING id,title,model,provider,created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`,
      [user.id,parsed.data.title || 'New chat',parsed.data.model ?? null,parsed.data.provider ?? null],
    );
    reply(res,201,{conversation:result.rows[0]}); return true;
  }

  const match = pathname.match(/^\/api\/conversations\/([0-9a-f-]{36})(?:\/(messages))?$/i);
  if (!match) { reply(res,404,{error:'Conversation route not found.'}); return true; }
  const [,conversationId,subresource] = match;
  const owned = await pool.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 LIMIT 1',[conversationId,user.id]);
  if (!owned.rows.length) { reply(res,404,{error:'Conversation not found.'}); return true; }

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
    const parsed = messageSchema.safeParse(await readJsonBody(req,60_000));
    if (!parsed.success) { reply(res,400,{error:'Provide a valid user or assistant message.'}); return true; }
    const result = await pool.query(
      `INSERT INTO messages(conversation_id,role,content,model,status)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id,role,content,model,status,created_at AS "createdAt"`,
      [conversationId,parsed.data.role,parsed.data.content,parsed.data.model ?? null,parsed.data.status || 'complete'],
    );
    await pool.query('UPDATE conversations SET updated_at=now() WHERE id=$1 AND user_id=$2',[conversationId,user.id]);
    reply(res,201,{message:result.rows[0]}); return true;
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
    const parsed = patchSchema.safeParse(await readJsonBody(req,12_000));
    if (!parsed.success) { reply(res,400,{error:'Provide valid conversation updates.'}); return true; }
    const value = parsed.data;
    const result = await pool.query(
      `UPDATE conversations SET
         title=COALESCE($3,title), model=CASE WHEN $4::boolean THEN $5 ELSE model END,
         provider=CASE WHEN $6::boolean THEN $7 ELSE provider END,
         archived_at=CASE WHEN $8::boolean THEN CASE WHEN $9::boolean THEN COALESCE(archived_at,now()) ELSE NULL END ELSE archived_at END,
         updated_at=now()
       WHERE id=$1 AND user_id=$2
       RETURNING id,title,model,provider,created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`,
      [conversationId,user.id,value.title ?? null,Object.hasOwn(value,'model'),value.model ?? null,
       Object.hasOwn(value,'provider'),value.provider ?? null,Object.hasOwn(value,'archived'),Boolean(value.archived)],
    );
    reply(res,200,{conversation:result.rows[0]}); return true;
  }
  if (req.method === 'DELETE') {
    await pool.query('DELETE FROM conversations WHERE id=$1 AND user_id=$2',[conversationId,user.id]);
    reply(res,200,{deleted:true,id:conversationId}); return true;
  }
  reply(res,405,{error:'Method not allowed.'}); return true;
}
