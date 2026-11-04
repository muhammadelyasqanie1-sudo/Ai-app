import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateRequest } from './auth.ts';

const BASE_URL = (process.env.BEATAPI_BASE_URL?.trim() || 'https://api.beatapi.io').replace(/\/+$/, '');
const API_KEY = process.env.BEATAPI_API_KEY?.trim() || '';

function send(res: ServerResponse, status: number, payload: unknown, requestId: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
  res.end(JSON.stringify({ ...(payload as object), requestId }));
}

async function readBody(req: IncomingMessage, maxBytes = 16_000): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

async function upstream(path: string, init: RequestInit = {}) {
  return fetch(BASE_URL + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(API_KEY && path === '/v1/models' ? { Authorization: 'Bearer ' + API_KEY } : {}),
      'X-Beat-Client': 'http',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(12_000),
    redirect: 'error',
  });
}

function upstreamError(status: number) {
  if (status === 401 || status === 403) return 'BeatAPI rejected the configured API key or the account is not permitted to access this resource.';
  if (status === 429) return 'BeatAPI rate limit reached. Retry later.';
  if (status >= 500) return 'BeatAPI is temporarily unavailable.';
  return 'BeatAPI rejected the read-only request.';
}

export async function handleBeatApiApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/beatapi/')) return false;
  const requestId = randomUUID();
  const user = await authenticateRequest(req);
  if (!user) { send(res, 401, { error: 'Sign in is required to access BeatAPI integration settings.' }, requestId); return true; }

  try {
    if (req.method === 'GET' && url.pathname === '/api/beatapi/status') {
      if (!API_KEY) { send(res, 200, { configured: false, connected: false, provider: 'beatapi', error: 'BEATAPI_API_KEY is not configured on the server.' }, requestId); return true; }
      const response = await upstream('/v1/models');
      if (!response.ok) { send(res, 200, { configured: true, connected: false, provider: 'beatapi', error: upstreamError(response.status) }, requestId); return true; }
      const payload = await response.json() as any;
      const models = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.data?.data) ? payload.data.data : [];
      send(res, 200, { configured: true, connected: true, provider: 'beatapi', modelCount: models.length, checkedAt: new Date().toISOString() }, requestId);
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/beatapi/models') {
      if (!API_KEY) { send(res, 503, { error: 'BEATAPI_API_KEY is not configured.' }, requestId); return true; }
      const response = await upstream('/v1/models');
      if (!response.ok) { send(res, response.status >= 500 ? 502 : response.status, { error: upstreamError(response.status) }, requestId); return true; }
      send(res, 200, await response.json(), requestId); return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/beatapi/workflows') {
      const response = await upstream('/v1/workflows');
      if (!response.ok) { send(res, response.status >= 500 ? 502 : response.status, { error: upstreamError(response.status) }, requestId); return true; }
      send(res, 200, await response.json(), requestId); return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/beatapi/capabilities/search') {
      const body = await readBody(req);
      if (!body) { send(res, 400, { error: 'A valid JSON object is required.' }, requestId); return true; }
      const parsed = z.object({
        query: z.string().trim().max(500).optional(),
        group_by: z.enum(['function','category','platform']).optional(),
        view: z.enum(['compact','full']).optional(),
      }).strict().safeParse(body);
      if (!parsed.success) { send(res, 400, { error: 'Invalid BeatAPI capability search parameters.' }, requestId); return true; }
      const response = await upstream('/v1/capabilities/search', { method: 'POST', body: JSON.stringify(parsed.data) });
      if (!response.ok) { send(res, response.status >= 500 ? 502 : response.status, { error: upstreamError(response.status) }, requestId); return true; }
      send(res, 200, await response.json(), requestId); return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/beatapi/capabilities/inspect') {
      const body = await readBody(req);
      const parsed = z.object({ reference: z.string().trim().min(1).max(300).regex(/^(model|data|workflow):.+$/) }).strict().safeParse(body || {});
      if (!parsed.success) { send(res, 400, { error: 'Provide an exact capability reference returned by BeatAPI Search.' }, requestId); return true; }
      const response = await upstream('/v1/capabilities/inspect', { method: 'POST', body: JSON.stringify(parsed.data) });
      if (!response.ok) { send(res, response.status >= 500 ? 502 : response.status, { error: upstreamError(response.status) }, requestId); return true; }
      send(res, 200, await response.json(), requestId); return true;
    }

    send(res, 404, { error: 'BeatAPI route not found.' }, requestId);
    return true;
  } catch (error) {
    console.warn('AFG_BEATAPI_READ_ONLY_REQUEST_FAILED', JSON.stringify({ requestId, error: error instanceof Error ? error.name : 'unknown' }));
    send(res, 502, { error: 'Could not reach BeatAPI. Check the server logs and integration settings.' }, requestId);
    return true;
  }
}
