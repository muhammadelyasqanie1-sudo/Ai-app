import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(32_000),
}).strict();

const chatSchema = z.object({
  model: z.string().trim().min(1).max(300),
  messages: z.array(messageSchema).min(1).max(80),
  stream: z.boolean().default(true),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(16_384).optional(),
}).strict();

function config() {
  const base = (process.env.OPENJARVIS_INTERNAL_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.OPENJARVIS_API_KEY || '').trim();
  return base && key ? { base, key } : null;
}

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  sendAuthJson(res, status, body);
}

async function callUpstream(path: string, key: string, signal?: AbortSignal) {
  const cfg = config();
  if (!cfg) throw new Error('OpenJarvis runtime is not configured.');
  return fetch(cfg.base + path, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    signal,
  });
}

export async function handleOpenJarvisApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  requestId: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/openjarvis')) return false;

  const user = await authenticateRequest(req);
  if (!user) {
    json(res, 401, { error: 'Sign in to AFG AI before using OpenJarvis.', code: 'authentication_required', requestId });
    return true;
  }

  const cfg = config();
  if (!cfg) {
    json(res, 503, {
      error: 'The OpenJarvis runtime is not connected yet. Configure OPENJARVIS_INTERNAL_URL and OPENJARVIS_API_KEY on the AFG AI server.',
      code: 'openjarvis_not_configured',
      requestId,
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/openjarvis/status') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(cfg.base + '/health', {
        headers: { Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' },
        signal: controller.signal,
      });
      json(res, response.ok ? 200 : 503, {
        connected: response.ok,
        status: response.ok ? 'ready' : 'unavailable',
        requestId,
      });
    } catch {
      json(res, 503, { connected: false, status: 'unavailable', requestId });
    } finally {
      clearTimeout(timer);
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/openjarvis/models') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await callUpstream('/v1/models', cfg.key, controller.signal);
      const payload = await response.json().catch(() => ({}));
      json(res, response.ok ? 200 : response.status, {
        ...(payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}),
        requestId,
      });
    } catch {
      json(res, 503, { error: 'OpenJarvis model discovery is unavailable.', code: 'model_discovery_failed', requestId });
    } finally {
      clearTimeout(timer);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/openjarvis/chat/completions') {
    if (!verifyCsrf(req)) {
      json(res, 403, { error: 'CSRF validation failed.', requestId });
      return true;
    }

    let raw: Record<string, unknown>;
    try {
      raw = await readJsonBody(req, 96_000);
    } catch {
      json(res, 400, { error: 'Provide a valid OpenJarvis chat request.', requestId });
      return true;
    }
    const parsed = chatSchema.safeParse(raw);
    if (!parsed.success) {
      json(res, 400, { error: 'The OpenJarvis chat request is invalid.', code: 'invalid_request', requestId });
      return true;
    }

    const abort = new AbortController();
    const abortUpstream = () => abort.abort();
    req.on('aborted', abortUpstream);
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    try {
      const response = await fetch(cfg.base + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + cfg.key,
          'Content-Type': 'application/json',
          Accept: parsed.data.stream ? 'text/event-stream' : 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(parsed.data),
        signal: abort.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        json(res, response.status, {
          error: 'OpenJarvis rejected the chat request.',
          code: 'openjarvis_upstream_error',
          upstreamStatus: response.status,
          detail: detail.slice(0, 800),
          requestId,
        });
        return true;
      }

      if (!response.body) {
        json(res, 502, { error: 'OpenJarvis returned an empty response.', code: 'empty_upstream_response', requestId });
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Request-Id', requestId);
      if (parsed.data.stream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || res.destroyed) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => res.once('drain', resolve));
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!res.writableEnded && !res.destroyed) res.end();
    } catch (error) {
      if (abort.signal.aborted) return true;
      if (!res.headersSent) {
        json(res, 503, { error: 'OpenJarvis could not complete this request.', code: 'openjarvis_unavailable', requestId });
      } else if (!res.writableEnded && !res.destroyed) {
        res.write('data: ' + JSON.stringify({ error: { message: 'OpenJarvis connection interrupted.', code: 'openjarvis_unavailable' } }) + '\n\n');
        res.end();
      }
    } finally {
      req.off('aborted', abortUpstream);
    }
    return true;
  }

  json(res, 404, { error: 'OpenJarvis route not found.', requestId });
  return true;
}
