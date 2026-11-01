import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { prepareVerifiedChat } from '../services/chatService.ts';
import { ProviderAdapterError } from '../providers/providerTypes.ts';
import { buildToolModePrompt } from '../services/toolModes.ts';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

// Per-process load shedding; identity-based/distributed rate limits require authenticated users.
let activeChatRequests = 0;
const MAX_CONCURRENT_CHAT_REQUESTS = 4;

function splitTranslationDocument(text: string, maxChars = 6000): string[] {
  const paragraphs = text.split(/(\n\s*\n)/);
  const chunks: string[] = [];
  let current = '';
  const push = () => { if (current.trim()) chunks.push(current); current = ''; };
  for (const part of paragraphs) {
    if (!part) continue;
    if (part.length <= maxChars) {
      if (current.length + part.length > maxChars) push();
      current += part;
      continue;
    }
    push();
    let remaining = part;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(' ', maxChars);
      if (cut < Math.floor(maxChars * 0.6)) cut = maxChars;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    current = remaining;
  }
  push();
  return chunks.length ? chunks : [text];
}

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
  if (activeChatRequests >= MAX_CONCURRENT_CHAT_REQUESTS) {
    res.setHeader('Retry-After', '5');
    sendJson(req, res, 503, { error: 'The chat service is busy. Please retry in a few seconds.', requestId: id }, id);
    return;
  }
  activeChatRequests += 1;
  const abortController = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abortController.abort(); });
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  try {
    const bodyChunks: Buffer[] = [];
    let bodyBytes = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bodyBytes += bytes.length;
      if (bodyBytes > 1_000_000) {
        sendJson(req, res, 413, { error: 'Request is too large.', requestId: id }, id);
        return;
      }
      bodyChunks.push(bytes);
    }
    // Decode only after concatenation so UTF-8 characters split across network chunks remain intact.
    const bodyStr = Buffer.concat(bodyChunks).toString('utf8');

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
    const requestedLanguage = body.language === 'dari' ? 'dari' : 'english';
    const model = typeof body.model === 'string' ? body.model.trim() : '';

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
      sendJson(req, res, 400, { error: 'Messages must contain between 1 and 100 items.', requestId: id }, id);
      return;
    }
    if (messages.some((message) =>
      !message || typeof message !== 'object' ||
      !['user', 'assistant'].includes(message.role) ||
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
    if (!model || (model !== 'auto' && !/^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}(?:::[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299})?$/.test(model))) {
      sendJson(req, res, 400, { error: 'Select a valid model from the verified provider catalog.', requestId: id }, id);
      return;
    }

    const toolMode = buildToolModePrompt(body, requestedLanguage);
    const systemMessages = [
      requestedLanguage === 'dari'
        ? 'Respond in clear, natural Dari Persian. Keep the entire response in Dari unless the user explicitly requests another language.'
        : 'Respond in clear English unless the user explicitly requests another language.',
      'You are AFG AI. Be honest about uncertainty and limitations. Never fabricate citations, URLs, quotations, sources, or tool results. Cite only sources actually supplied or retrieved in this request. If no verifiable source is available, say so clearly. Distinguish confirmed facts from estimates and opinions.',
      toolMode.prompt,
    ].filter(Boolean);

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
    if (upstreamMessages[upstreamMessages.length - 1]?.role !== 'user') {
      sendJson(req, res, 400, { error: 'The final conversation message must be the new user prompt.', requestId: id }, id);
      return;
    }
    if (toolMode.mode === 'translation') {
      const lastUser = upstreamMessages[upstreamMessages.length - 1];
      if (lastUser.content.length > 6000) {
        const chunks = splitTranslationDocument(lastUser.content);
        lastUser.content = 'Translate every numbered segment in order. Keep terminology consistent across all segments, preserve the original paragraph and markup structure, and do not omit or summarize any segment. Return the translated segments in the same order.\\n\\n' +
          chunks.map((chunk, index) => `[Segment ${index + 1} of ${chunks.length}]\\n${chunk}`).join('\\n\\n');
      }
    }

    const prepared = await prepareVerifiedChat({ model, messages: upstreamMessages, signal: abortController.signal });
    const { providerId, modelId, stream } = prepared;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-Id': id,
      ...corsHeaders(req),
    });

    let emittedContent = false;
    heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
    }, 15_000);
    try {
      for await (const chunk of stream) {
        if (!chunk.content) continue;
        emittedContent = true;
        res.write(`data: ${JSON.stringify({ type: 'content', text: chunk.content })}\n\n`);
      }
      if (!emittedContent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'The AI provider returned an empty response. Please retry.', retryable: true, requestId: id })}\n\n`);
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ type: 'done', requestId: id })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('AI_PROVIDER_STREAM_FAILED', JSON.stringify({
        requestId: id,
        provider: prepared.providerId,
        model: prepared.modelId,
        code: error instanceof ProviderAdapterError ? error.code : 'unexpected_stream_error',
      }));
      if (!res.destroyed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'The AI response stream was interrupted. Your prompt is still available to retry.',
          retryable: true,
          requestId: id,
        })}\n\n`);
        res.end();
      }
    }
  } catch (error) {
    const providerError = error instanceof ProviderAdapterError ? error : null;
    console.error('AI_CHAT_REQUEST_FAILED', JSON.stringify({
      requestId: id,
      provider: 'unknown-or-not-selected',
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
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    activeChatRequests = Math.max(0, activeChatRequests - 1);
  }
}
