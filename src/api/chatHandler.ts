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
      sendJson(res, 400, { error: 'Please select a model in the app.' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      sendJson(res, 503, { error: 'OpenAI API is not configured. Add OPENAI_API_KEY in Render Environment.' });
      return;
    }

    const upstreamMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
      .map((m) => ({ role: m.role, content: String(m.content ?? '') }));

    if (customInstructions) {
      upstreamMessages.unshift({ role: 'system', content: customInstructions });
    }

    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: upstreamMessages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const details = await upstream.text();
      console.error('OpenAI API request failed:', upstream.status, details.slice(0, 1200));
      sendJson(res, upstream.status, {
        error: 'OpenAI API request failed',
        status: upstream.status,
        details: details.slice(0, 700),
      });
      return;
    }

    if (!upstream.body) {
      sendJson(res, 502, { error: 'OpenAI API returned an empty response stream' });
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
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const event = JSON.parse(data);
            const piece = event.choices?.[0]?.delta?.content;
            if (typeof piece === 'string' && piece.length > 0) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: piece })}\n\n`);
            }
          } catch {
            // Ignore non-JSON keepalive/event lines.
          }
        }
      }
      if (buffer.trim().startsWith('data:')) {
        const data = buffer.trim().slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            const event = JSON.parse(data);
            const piece = event.choices?.[0]?.delta?.content;
            if (typeof piece === 'string' && piece.length > 0) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: piece })}\n\n`);
            }
          } catch {
            // Ignore incomplete final event.
          }
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error: any) {
    console.error('Chat API error:', error?.message || error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'OpenAI stream failed' })}\n\n`);
      res.end();
    }
  }
}
