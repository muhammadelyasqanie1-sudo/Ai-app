import type { IncomingMessage, ServerResponse } from 'http';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

export async function handleChatApi(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    let bodyStr = '';
    for await (const chunk of req) {
      bodyStr += chunk.toString();
      if (bodyStr.length > 1_000_000) {
        sendJson(res, 413, { error: 'Request is too large' });
        return;
      }
    }

    const body = JSON.parse(bodyStr || '{}');
    const messages = body.messages as ChatMessage[] | undefined;
    const customInstructions = String(body.customInstructions || '');
    const model = String(body.model || '').trim();

    if (!Array.isArray(messages) || messages.length === 0) {
      sendJson(res, 400, { error: 'Missing messages array' });
      return;
    }
    if (!model || !/^@cf\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(model)) {
      sendJson(res, 400, { error: 'Please select a valid Cloudflare Workers AI model in the app.' });
      return;
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!accountId || !apiToken) {
      sendJson(res, 503, { error: 'Cloudflare Workers AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Render Environment.' });
      return;
    }

    const systemMessages = messages
      .filter((m) => m && m.role === 'system')
      .map((m) => String(m.content ?? ''));
    if (customInstructions) systemMessages.unshift(customInstructions);

    const upstreamMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    if (systemMessages.join('\n\n').trim()) {
      upstreamMessages.push({ role: 'system', content: systemMessages.join('\n\n') });
    }
    upstreamMessages.push(...messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }))
      .filter((m) => m.content.length > 0));

    if (!upstreamMessages.some((m) => m.role === 'user')) {
      sendJson(res, 400, { error: 'At least one user message is required.' });
      return;
    }

    const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ messages: upstreamMessages, stream: true }),
    });

    if (!upstream.ok) {
      const details = await upstream.text();
      console.error('Cloudflare Workers AI request failed:', upstream.status, details.slice(0, 1200));
      sendJson(res, upstream.status, {
        error: 'Cloudflare Workers AI request failed',
        status: upstream.status,
        details: details.slice(0, 700),
      });
      return;
    }

    if (!upstream.body) {
      sendJson(res, 502, { error: 'Cloudflare returned an empty response stream.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
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
              console.error('Cloudflare stream error:', JSON.stringify(event.error).slice(0, 800));
            }
          } catch {
            // Ignore non-JSON SSE events.
          }
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error: any) {
    console.error('Cloudflare Workers AI error:', error?.message || error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Cloudflare AI stream failed' })}\n\n`);
      res.end();
    }
  }
}
