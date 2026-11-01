import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { handleChatApi } from './chatHandler.ts';
import { checkDatabase } from './database.ts';
import { getProviderModelCatalog } from './modelCatalog.ts';
import { getCapabilitySnapshot, getImageStudioSnapshot, getFileAssistantSnapshot } from '../services/providerGateway.ts';
import { handleAuthApi } from './auth.ts';
import { handleAdminApi } from './adminHandler.ts';
import { handleResearchApi } from './research.ts';

type ApiRequest = IncomingMessage & { originalUrl?: string };

function corsHeaders(req: IncomingMessage) {
  const origin = req.headers.origin;
  const configured = (process.env.APP_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = new Set([...configured, 'http://localhost:3000', 'http://localhost:5173', 'https://localhost', 'capacitor://localhost']);
  return origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown, requestId: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.end(JSON.stringify({ ...(body as Record<string, unknown>), requestId }));
}

export async function handleApiRequest(req: ApiRequest, res: ServerResponse): Promise<void> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const pathname = new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname;
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));

  res.on('finish', () => {
    console.info('API_REQUEST', JSON.stringify({
      requestId,
      method: req.method,
      path: pathname,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.end();
    return;
  }

  try {
    if (await handleAuthApi(req, res, pathname)) return;
    if (await handleAdminApi(req, res, pathname)) return;

    if (await handleResearchApi(req, res)) return;

    if (pathname === '/api/chat') {
      await handleChatApi(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'afg-ai-api',
        timestamp: new Date().toISOString(),
      }, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/ready') {
      const database = await checkDatabase();
      const ready = database.configured && database.connected;
      sendJson(res, ready ? 200 : 503, {
        status: ready ? 'ready' : 'degraded',
        database,
      }, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/models') {
      const catalog = await getProviderModelCatalog();
      sendJson(res, catalog.status, catalog.body, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/studio/capabilities') {
      const snapshot = await getImageStudioSnapshot();
      sendJson(res, snapshot.available ? 200 : 503, snapshot, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/files/status') {
      const snapshot = await getFileAssistantSnapshot();
      sendJson(res, 200, snapshot, requestId);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/capabilities') {
      const snapshot = await getCapabilitySnapshot();
      sendJson(res, snapshot.verified ? 200 : 503, snapshot, requestId);
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'API route not found.' }, requestId);
      return;
    }

    sendJson(res, 404, { error: 'API route not found.' }, requestId);
  } catch {
    console.error('API_EDGE_FAILURE', JSON.stringify({ requestId, method: req.method, path: pathname }));
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'The API request failed unexpectedly.' }, requestId);
    } else {
      res.end();
    }
  }
}
