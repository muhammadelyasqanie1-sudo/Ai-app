import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';

function isAdmin(role: string) { return role === 'admin' || role === 'superadmin'; }

export async function handleAdminTerminalGatewayApi(
  req: IncomingMessage, res: ServerResponse, pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/admin/terminal-gateway')) return false;
  const user = await authenticateRequest(req).catch(() => null);
  if (!user || !isAdmin(user.role)) {
    sendAuthJson(res, user ? 403 : 401, { error: user ? 'Administrator access is required.' : 'Sign in as an administrator.' });
    return true;
  }
  if (req.method !== 'GET' && !verifyCsrf(req)) {
    sendAuthJson(res, 403, { error: 'CSRF validation failed.' });
    return true;
  }
  if (!pool) {
    sendAuthJson(res, 503, { error: 'The terminal gateway requires PostgreSQL.' });
    return true;
  }

  try {
    if (req.method === 'GET' && pathname === '/api/admin/terminal-gateway/status') {
      const [workers, jobs] = await Promise.all([
        pool.query(`SELECT worker_id,hostname,version,started_at,last_seen_at,
                    (last_seen_at > now()-interval '45 seconds' AND stopped_at IS NULL) AS online
               FROM admin_terminal_gateway_workers ORDER BY last_seen_at DESC LIMIT 10`),
        pool.query(`SELECT status,count(*)::int AS count FROM admin_terminal_gateway_jobs
                     WHERE created_at>now()-interval '24 hours' GROUP BY status`),
      ]);
      sendAuthJson(res, 200, { workers: workers.rows, jobs: jobs.rows, shellExecution: false });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/terminal-gateway/jobs') {
      const body = await readJsonBody(req, 80_000);
      const model = typeof body.model === 'string' ? body.model.trim().slice(0, 300) : 'auto';
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!model || messages.length < 1 || messages.length > 40) {
        sendAuthJson(res, 400, { error: 'Provide a model and between 1 and 40 messages.' });
        return true;
      }
      let total = 0;
      const normalized: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const item of messages) {
        if (!item || typeof item !== 'object') {
          sendAuthJson(res, 400, { error: 'Each message must contain a supported role and text.' });
          return true;
        }
        const record = item as Record<string, unknown>;
        if (!['user', 'assistant'].includes(String(record.role)) || typeof record.content !== 'string') {
          sendAuthJson(res, 400, { error: 'Only user and assistant messages are accepted; system instructions are server-owned.' });
          return true;
        }
        const content = record.content.trim();
        total += content.length;
        if (!content || content.length > 20_000 || total > 60_000) {
          sendAuthJson(res, 400, { error: 'Message content exceeds the allowed size.' });
          return true;
        }
        normalized.push({ role: record.role as 'user' | 'assistant', content });
      }
      const requestId = randomUUID();
      const result = await pool.query(
        `INSERT INTO admin_terminal_gateway_jobs(requested_by,request_id,model,messages,no_fallback)
         VALUES($1,$2,$3,$4::jsonb,$5)
         RETURNING id,request_id,model,status,created_at,expires_at`,
        [user.id, requestId, model, JSON.stringify(normalized), body.noFallback === true],
      );
      sendAuthJson(res, 202, { job: result.rows[0] });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/terminal-gateway/jobs') {
      const result = await pool.query(
        `SELECT id,request_id,model,status,provider_id,model_id,error_code,created_at,started_at,completed_at
           FROM admin_terminal_gateway_jobs WHERE requested_by=$1
          ORDER BY created_at DESC LIMIT 50`, [user.id],
      );
      sendAuthJson(res, 200, { jobs: result.rows });
      return true;
    }

    const match = pathname.match(/^\/api\/admin\/terminal-gateway\/jobs\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && match) {
      const result = await pool.query(
        `SELECT id,request_id,model,status,output_text,error_code,provider_id,model_id,
                created_at,started_at,completed_at
           FROM admin_terminal_gateway_jobs WHERE id=$1 AND requested_by=$2 LIMIT 1`,
        [match[1], user.id],
      );
      if (!result.rowCount) {
        sendAuthJson(res, 404, { error: 'Gateway job not found.' });
        return true;
      }
      sendAuthJson(res, 200, { job: result.rows[0] });
      return true;
    }

    sendAuthJson(res, 404, { error: 'Terminal gateway route not found.' });
    return true;
  } catch {
    sendAuthJson(res, 500, { error: 'Terminal gateway operation failed.' });
    return true;
  }
}
