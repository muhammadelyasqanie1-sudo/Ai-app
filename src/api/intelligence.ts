import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';

const knowledgeSchema = z.object({
  title: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(30_000),
  sourceLabel: z.string().trim().max(180).optional().default(''),
}).strict();

const trainingExampleSchema = z.object({
  prompt: z.string().trim().min(1).max(10_000),
  idealAnswer: z.string().trim().min(1).max(20_000),
  consent: z.literal(true),
}).strict();

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) {
  sendAuthJson(res, status, body);
}

/** Owner-scoped private knowledge and explicit-consent training-data endpoints. */
export async function handleIntelligenceApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/intelligence/')) return false;
  if (!pool) {
    reply(res, 503, { error: 'AFG AI Intelligence requires DATABASE_URL and migration 0035.' });
    return true;
  }
  const user = await authenticateRequest(req);
  if (!user) {
    reply(res, 401, { error: 'Sign in to manage your private AFG AI knowledge.' });
    return true;
  }
  if (!['GET', 'HEAD'].includes(req.method || 'GET') && !verifyCsrf(req)) {
    reply(res, 403, { error: 'CSRF validation failed.' });
    return true;
  }

  if (pathname === '/api/intelligence/knowledge' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT id,title,source_label AS "sourceLabel",char_length(content) AS "characterCount",
              created_at AS "createdAt",updated_at AS "updatedAt"
         FROM knowledge_documents WHERE user_id=$1
        ORDER BY updated_at DESC LIMIT 100`,
      [user.id],
    );
    reply(res, 200, { documents: result.rows });
    return true;
  }
  if (pathname === '/api/intelligence/knowledge' && req.method === 'POST') {
    try {
      const parsed = knowledgeSchema.safeParse(await readJsonBody(req, 36_000));
      if (!parsed.success) {
        reply(res, 400, { error: 'Provide a title and 1–30,000 characters of knowledge text.' });
        return true;
      }
      const result = await pool.query(
        `INSERT INTO knowledge_documents(user_id,title,content,source_label)
         VALUES($1,$2,$3,$4)
         RETURNING id,title,source_label AS "sourceLabel",char_length(content) AS "characterCount",
                   created_at AS "createdAt",updated_at AS "updatedAt"`,
        [user.id, parsed.data.title, parsed.data.content, parsed.data.sourceLabel],
      );
      reply(res, 201, { document: result.rows[0] });
    } catch {
      reply(res, 400, { error: 'Could not save this knowledge document.' });
    }
    return true;
  }
  const knowledgeMatch = pathname.match(/^\/api\/intelligence\/knowledge\/([0-9a-f-]{36})$/i);
  if (knowledgeMatch && req.method === 'DELETE') {
    const result = await pool.query(
      'DELETE FROM knowledge_documents WHERE id=$1 AND user_id=$2 RETURNING id',
      [knowledgeMatch[1], user.id],
    );
    reply(res, result.rowCount ? 200 : 404, result.rowCount ? { deleted: true } : { error: 'Knowledge document not found.' });
    return true;
  }

  if (pathname === '/api/intelligence/training/examples' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT id,prompt,ideal_answer AS "idealAnswer",consented_at AS "consentedAt",created_at AS "createdAt"
         FROM training_examples WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [user.id],
    );
    reply(res, 200, { examples: result.rows });
    return true;
  }
  if (pathname === '/api/intelligence/training/examples' && req.method === 'POST') {
    try {
      const parsed = trainingExampleSchema.safeParse(await readJsonBody(req, 32_000));
      if (!parsed.success) {
        reply(res, 400, { error: 'A prompt, ideal answer and explicit consent are required.' });
        return true;
      }
      const result = await pool.query(
        `INSERT INTO training_examples(user_id,prompt,ideal_answer,consented_at)
         VALUES($1,$2,$3,now())
         RETURNING id,prompt,ideal_answer AS "idealAnswer",consented_at AS "consentedAt",created_at AS "createdAt"`,
        [user.id, parsed.data.prompt, parsed.data.idealAnswer],
      );
      reply(res, 201, { example: result.rows[0] });
    } catch {
      reply(res, 400, { error: 'Could not save this training example.' });
    }
    return true;
  }
  const exampleMatch = pathname.match(/^\/api\/intelligence\/training\/examples\/([0-9a-f-]{36})$/i);
  if (exampleMatch && req.method === 'DELETE') {
    const result = await pool.query(
      'DELETE FROM training_examples WHERE id=$1 AND user_id=$2 RETURNING id',
      [exampleMatch[1], user.id],
    );
    reply(res, result.rowCount ? 200 : 404, result.rowCount ? { deleted: true } : { error: 'Training example not found.' });
    return true;
  }

  if (pathname === '/api/intelligence/training/export' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT prompt,ideal_answer AS "completion"
         FROM training_examples WHERE user_id=$1
        ORDER BY created_at ASC LIMIT 2000`,
      [user.id],
    );
    const jsonl = result.rows.map((row: { prompt: string; completion: string }) =>
      JSON.stringify({ messages: [
        { role: 'user', content: row.prompt },
        { role: 'assistant', content: row.completion },
      ] }),
    );
    reply(res, 200, { format: 'jsonl', count: jsonl.length, lines: jsonl });
    return true;
  }

  reply(res, 404, { error: 'Intelligence route not found.' });
  return true;
}
