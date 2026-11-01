import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { getCloudflareModelCatalog } from './modelCatalog.ts';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function requestId(req: IncomingMessage) {
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
  const id = requestId(req);
  res.setHeader('X-Request-Id', id);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
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
      if (bodyStr.length > 1_000_000) {
        sendJson(req, res, 413, { error: 'Request is too large.', requestId: id }, id);
        return;
      }
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyStr || '{}');
    } catch {
      sendJson(req, res, 400, { error: 'Request body must contain valid JSON.', requestId: id }, id);
      return;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(req, res, 400, { error: 'Request body must be a JSON object.', requestId: id }, id);
      return;
    }
    const messages = body.messages as ChatMessage[] | undefined;
    const customInstructions = String(body.customInstructions || '').slice(0, 8_000);
    const model = String(body.model || '').trim();

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
      sendJson(req, res, 400, { error: 'Messages must contain between 1 and 100 items.', requestId: id }, id);
      return;
    }
    if (messages.some((message) =>
      !message || !['user', 'assistant', 'system'].includes(message.role) ||
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

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!accountId || !apiToken) {
      sendJson(req, res, 503, { error: 'AI provider is not configured on the server.', requestId: id }, id);
      return;
    }

    const catalog = await getCloudflareModelCatalog();
    if (catalog.status !== 200) {
      sendJson(req, res, catalog.status, { error: catalog.body.error || 'The AI provider could not verify its model catalog. Please retry.', requestId: id }, id);
      return;
    }
    if (!catalog.body.models.includes(model)) {
      sendJson(req, res, 400, { error: 'This model is not currently verified as available for chat. Refresh the model list.', requestId: id }, id);
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

    const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ model, messages: upstreamMessages, stream: true }),
    });

    if (!upstream.ok) {
      console.error('AI_PROVIDER_REQUEST_FAILED', JSON.stringify({ requestId: id, status: upstream.status, provider: 'cloudflare', model }));
      sendJson(req, res, upstream.status, {
        error: 'The AI provider rejected the request. Check model access or try another verified model.',
        requestId: id,
      }, id);
      return;
    }
    if (!upstream.body) {
      sendJson(req, res, 502, { error: 'The AI provider returned an empty response stream.', requestId: id }, id);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-Id': id,
      ...corsHeaders(req),
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const eventText of events) {
          const dataLine = eventText.split(/\r?\n/).find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          const data = dataLine.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const event = JSON.parse(data);
            const piece =
              typeof event.response === 'string' ? event.response :
              typeof event.text === 'string' ? event.text :
              typeof event.choices?.[0]?.delta?.content === 'string' ? event.choices[0].delta.content :
              undefined;
            if (typeof piece === 'string' && piece.length > 0) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: piece })}\n\n`);
            }
            if (event.error) {
              console.error('AI_PROVIDER_STREAM_ERROR', JSON.stringify({ requestId: id, model, provider: 'cloudflare' }));
            }
          } catch {
            // Ignore non-JSON SSE events.
          }
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done', requestId: id })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error('AI_CHAT_HANDLER_ERROR', JSON.stringify({ requestId: id, provider: 'cloudflare' }));
    if (!res.headersSent) {
      sendJson(req, res, 500, { error: 'The AI request failed unexpectedly. Please retry.', requestId: id }, id);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'The AI response stream was interrupted.', requestId: id })}\n\n`);
      res.end();
    }
  }
}
