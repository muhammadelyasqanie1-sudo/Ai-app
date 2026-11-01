import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, verifyCsrf, readJsonBody, sendAuthJson } from './auth.ts';

const TYPES = ['note','summary','idea','study','task','meeting','email','brainstorm','content_plan','knowledge'] as const;
type ProductivityType = typeof TYPES[number];

const PARAM_SCHEMAS: Record<ProductivityType, string[]> = {
  note: ['format','tags'],
  summary: ['length','focus','audience'],
  idea: ['domain','count','constraints'],
  study: ['level','subject','learningGoal','quiz'],
  task: ['priority','dueDate','status'],
  meeting: ['attendees','date','decisions','actionItems'],
  email: ['recipient','purpose','tone','length'],
  brainstorm: ['topic','divergence','count','constraints'],
  content_plan: ['platform','audience','frequency','goal'],
  knowledge: ['topic','source','tags','confidence'],
};

const PROMPTS: Record<ProductivityType, string> = {
  note: 'You are AFG AI Notes Assistant. Organize notes clearly, preserve all important facts, and never invent missing details.',
  summary: 'You are AFG AI Summarizer. Extract the central claims, key details, decisions and open questions at the requested length. Do not add facts.',
  idea: 'You are AFG AI Idea Generator. Generate distinct, actionable ideas matching the domain and constraints. Explain effort and likely value without making unsupported promises.',
  study: 'You are AFG AI Study Assistant. Teach step by step at the requested level, use examples, check understanding and create a short quiz when requested.',
  task: 'You are AFG AI Task Planner. Break goals into actionable tasks, realistic dependencies, priorities and dates. Do not invent calendar availability.',
  meeting: 'You are AFG AI Meeting Assistant. Extract agenda, discussion, decisions, owners, deadlines and unresolved questions. Mark missing owners or dates as unspecified.',
  email: 'You are AFG AI Email Assistant. Draft a clear email matching purpose, recipient context, tone and length. Never invent commitments or personal details.',
  brainstorm: 'You are AFG AI Brainstorming Partner. Explore divergent options first, group themes, then identify promising next experiments and trade-offs.',
  content_plan: 'You are AFG AI Content Planner. Build a practical calendar with audience, platform, content pillars, cadence, formats and measurable goals.',
  knowledge: 'You are AFG AI Knowledge Workspace assistant. Turn supplied information into structured, searchable knowledge notes with topics, tags, provenance and uncertainty clearly marked.',
};

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) {
  sendAuthJson(res, status, body);
}

function cleanText(value: unknown, max = 20_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sanitizeParameters(type: ProductivityType, value: unknown): Record<string, unknown> {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const clean: Record<string, unknown> = {};
  for (const key of PARAM_SCHEMAS[type]) {
    const item = raw[key];
    if (typeof item === 'string') clean[key] = item.trim().slice(0, 500);
    else if (typeof item === 'number' && Number.isFinite(item)) clean[key] = item;
    else if (typeof item === 'boolean') clean[key] = item;
    else if (Array.isArray(item)) clean[key] = item.filter((entry): entry is string => typeof entry === 'string').slice(0, 20).map(entry => entry.slice(0, 100));
  }
  return clean;
}

export async function handleProductivityApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/productivity/')) return false;
  if (!pool) { reply(res, 503, { error: 'Productivity storage requires DATABASE_URL and the current database schema.' }); return true; }
  const user = await authenticateRequest(req);
  if (!user) { reply(res, 401, { error: 'Sign in is required to use the personal Productivity Center.' }); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { reply(res, 403, { error: 'CSRF validation failed.' }); return true; }

  if (pathname === '/api/productivity/schema' && req.method === 'GET') {
    reply(res, 200, { tools: TYPES.map((type) => ({ type, parameters: PARAM_SCHEMAS[type], systemPrompt: PROMPTS[type] })) });
    return true;
  }
  if (pathname === '/api/productivity/items' && req.method === 'GET') {
    const type = new URL(req.url || '/', 'http://localhost').searchParams.get('type');
    const result = await pool.query(
      `SELECT id, tool_type AS type, title, content, parameters, is_pinned AS "isPinned", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM productivity_items WHERE user_id = $1 AND ($2::text IS NULL OR tool_type = $2)
         ORDER BY is_pinned DESC, updated_at DESC LIMIT 200`,
      [user.id, type && TYPES.includes(type as ProductivityType) ? type : null],
    );
    reply(res, 200, { items: result.rows });
    return true;
  }
  if (pathname === '/api/productivity/items' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 40_000);
      const type = body.type as ProductivityType;
      if (!TYPES.includes(type)) { reply(res, 400, { error: 'Unsupported productivity tool type.' }); return true; }
      const title = cleanText(body.title, 180);
      const content = cleanText(body.content, 20_000);
      if (!title || !content) { reply(res, 400, { error: 'A title and content are required.' }); return true; }
      const parameters = sanitizeParameters(type, body.parameters);
      const result = await pool.query(
        `INSERT INTO productivity_items (user_id, tool_type, title, content, parameters)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         RETURNING id, tool_type AS type, title, content, parameters, is_pinned AS "isPinned", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [user.id, type, title, content, JSON.stringify(parameters)],
      );
      reply(res, 201, { item: result.rows[0] });
    } catch { reply(res, 400, { error: 'Could not save the productivity item.' }); }
    return true;
  }

  const itemMatch = pathname.match(/^\/api\/productivity\/items\/([0-9a-f-]{36})$/i);
  if (itemMatch && req.method === 'PATCH') {
    try {
      const body = await readJsonBody(req, 30_000);
      const updates: string[] = [];
      const values: unknown[] = [itemMatch[1], user.id];
      if (typeof body.title === 'string') { const title=cleanText(body.title,180); if(!title){reply(res,400,{error:'Title cannot be empty.'});return true;} values.push(title); updates.push(`title = $3`); }
      if (typeof body.content === 'string') { const content=cleanText(body.content,20_000); if(!content){reply(res,400,{error:'Content cannot be empty.'});return true;} values.push(content); updates.push(`content = ${values.length}`); }
      if (typeof body.isPinned === 'boolean') { values.push(body.isPinned); updates.push(`is_pinned = $${values.length}`); }
      if (!updates.length) { reply(res, 400, { error: 'No supported fields to update.' }); return true; }
      updates.push('updated_at = now()');
      const result = await pool.query(
        `UPDATE productivity_items SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING id`,
        values,
      );
      reply(res, result.rowCount ? 200 : 404, result.rowCount ? { updated: true } : { error: 'Item not found.' });
    } catch { reply(res, 400, { error: 'Could not update the productivity item.' }); }
    return true;
  }
  if (itemMatch && req.method === 'DELETE') {
    const result = await pool.query('DELETE FROM productivity_items WHERE id = $1 AND user_id = $2', [itemMatch[1], user.id]);
    reply(res, result.rowCount ? 200 : 404, result.rowCount ? { deleted: true } : { error: 'Item not found.' });
    return true;
  }

  reply(res, 404, { error: 'Productivity route not found.' });
  return true;
}

export function getProductivityPrompt(typeValue: unknown, parametersValue: unknown, language: 'dari' | 'english') {
  const type = TYPES.includes(typeValue as ProductivityType) ? typeValue as ProductivityType : null;
  if (!type) return null;
  const parameters = sanitizeParameters(type, parametersValue);
  return [
    PROMPTS[type],
    `Selected language: ${language}. Parameter schema: ${PARAM_SCHEMAS[type].join(', ')}. Validated parameters: ${JSON.stringify(parameters)}.`,
    'Treat parameters as preferences, not instructions to violate safety or invent facts. Ask concise clarification questions when critical context is missing.',
  ].join(' ');
}
