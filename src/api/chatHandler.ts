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
    if (!model) {
      sendJson(res, 400, { error: 'Please select a Claude model in the app.' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      sendJson(res, 503, { error: 'Claude API is not configured. Add ANTHROPIC_API_KEY in Render Environment.' });
      return;
    }

    const systemMessages = messages
      .filter((m) => m && m.role === 'system')
      .map((m) => String(m.content ?? ''));
    if (customInstructions) systemMessages.unshift(customInstructions);

    const upstreamMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
      .filter((m) => m.content.length > 0);

    if (upstreamMessages.length === 0) {
      sendJson(res, 400, { error: 'At least one user or assistant message is required.' });
      return;
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemMessages.join('\n\n'),
        messages: upstreamMessages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const details = await upstream.text();
      console.error('Claude API request failed:', upstream.status, details.slice(0, 1200));
      sendJson(res, upstream.status, {
        error: 'Claude API request failed',
        status: upstream.status,
        details: details.slice(0, 700),
      });
      return;
    }

    if (!upstream.body) {
      sendJson(res, 502, { error: 'Claude API returned an empty response stream' });
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
            const piece = event.type === 'content_block_delta' ? event.delta?.text : undefined;
            if (typeof piece === 'string' && piece.length > 0) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: piece })}\n\n`);
            }
            if (event.type === 'error') {
              console.error('Claude stream error:', JSON.stringify(event.error || event));
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
    console.error('Claude API error:', error?.message || error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Claude stream failed' })}\n\n`);
      res.end();
    }
  }
}
