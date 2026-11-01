import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { prepareVerifiedChat } from '../services/chatService.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function getRequestId(req: IncomingMessage) {
  const supplied = req.headers['x-request-id'];
  return typeof supplied === 'string' && /^[a-zA-Z0-9._-]{8,100}$/.test(supplied)
    ? supplied
    : randomUUID();
}

function corsHeaders(req: IncomingMessage) {
  const origin = req.headers.origin;
  const configured = (process.env.APP_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = new Set([...configured, 'http://localhost:3000', 'http://localhost:5173', 'https://localhost', 'capacitor://localhost']);
  return origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, payload: unknown, id: string) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Request-Id': id,
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(payload));
}

export async function handleChatApi(req: IncomingMessage, res: ServerResponse) {
  const id = getRequestId(req);
  res.setHeader('X-Request-Id', id);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id',
      'Vary': 'Origin',
      'X-Request-Id': id,
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method not allowed', requestId: id }, id);
    return;
  }

  try {
    let bodyStr = '';
    for await (const chunk of req) {
      bodyStr += chunk.toString();
      if (Buffer.byteLength(bodyStr, 'utf8') > 1_000_000) {
        sendJson(req, res, 413, { error: 'Request is too large.', requestId: id }, id);
        return;
      }
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(bodyStr || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        sendJson(req, res, 400, { error: 'Request body must be a JSON object.', requestId: id }, id);
        return;
      }
      body = parsed as Record<string, unknown>;
    } catch {
      sendJson(req, res, 400, { error: 'Request body must contain valid JSON.', requestId: id }, id);
      return;
    }

    const messages = body.messages as ChatMessage[] | undefined;
    const customInstructions = typeof body.customInstructions === 'string' ? body.customInstructions.slice(0, 8_000) : '';
    const model = typeof body.model === 'string' ? body.model.trim() : '';

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
      sendJson(req, res, 400, { error: 'Messages must contain between 1 and 100 items.', requestId: id }, id);
      return;
    }
    if (messages.some((message) =>
      !message || typeof message !== 'object' ||
      !['user', 'assistant', 'system'].includes(message.role) ||
      typeof message.content !== 'string' || message.content.length > 50_000
    )) {
      sendJson(req, res, 400, { error: 'Each message must have a valid role and text content under 50,000 characters.', requestId: id }, id);
      return;
    }

    const totalCharacters = messages.reduce((total, message) => total + message.content.length, 0);
    if (totalCharacters > 200_000) {
      sendJson(req, res, 413, { error: 'Conversation is too large. Shorten the message history.', requestId: id }, id);
      return;
    }
    if (!model || !/^@cf\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(model)) {
      sendJson(req, res, 400, { error: 'Select a valid model from the verified provider catalog.', requestId: id }, id);
      return;
    }

    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);
    if (customInstructions) systemMessages.unshift(customInstructions);

    const upstreamMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    if (systemMessages.join('\n\n').trim()) {
      upstreamMessages.push({ role: 'system', content: systemMessages.join('\n\n') });
    }
    upstreamMessages.push(...messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }))
      .filter((message) => message.content.length > 0));

    if (!upstreamMessages.some((message) => message.role === 'user')) {
      sendJson(req, res, 400, { error: 'At least one user message is required.', requestId: id }, id);
      return;
    }

    const stream = await prepareVerifiedChat({ model, messages: upstreamMessages });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-Id': id,
      ...corsHeaders(req),
    });

    let emittedContent = false;
    try {
      for await (const piece of stream) {
        emittedContent = true;
        res.write(`data: ${JSON.stringify({ type: 'content', text: piece })}\n\n`);
      }
      if (!emittedContent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'The AI provider returned an empty response.', requestId: id })}\n\n`);
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ type: 'done', requestId: id })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('AI_PROVIDER_STREAM_FAILED', JSON.stringify({
        requestId: id,
        provider: 'cloudflare-workers-ai',
        model,
        code: error instanceof ProviderAdapterError ? error.code : 'unexpected_stream_error',
      }));
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'The AI response stream was interrupted. Your prompt is still available to retry.',
        requestId: id,
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    const providerError = error instanceof ProviderAdapterError ? error : null;
    console.error('AI_CHAT_REQUEST_FAILED', JSON.stringify({
      requestId: id,
      provider: 'cloudflare-workers-ai',
      code: providerError?.code || 'request_failed',
      status: providerError?.status || 500,
    }));
    if (!res.headersSent) {
      sendJson(req, res, providerError?.status || 500, {
        error: providerError?.message || 'The AI request failed unexpectedly. Please retry.',
        requestId: id,
      }, id);
    } else {
      res.end();
    }
  }
}
