import type { IncomingMessage, ServerResponse } from 'http';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
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

    if (!Array.isArray(messages) || messages.length === 0) {
      sendJson(res, 400, { error: 'Missing messages array' });
      return;
    }

    const apiKey = process.env.NVIDIA_API_KEY?.trim();
    if (!apiKey) {
      sendJson(res, 503, { error: 'NVIDIA API is not configured. Set NVIDIA_API_KEY on the server.' });
      return;
    }

    const model = process.env.NVIDIA_MODEL?.trim() || 'deepseek-ai/deepseek-v4-flash';
    const upstreamMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
      .map((m) => ({ role: m.role, content: String(m.content ?? '') }));

    if (customInstructions) {
      upstreamMessages.unshift({
        role: 'system',
        content: customInstructions,
      });
    }

    const upstream = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: upstreamMessages,
        temperature: 0.6,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const details = await upstream.text();
      console.error('NVIDIA NIM request failed:', upstream.status, details.slice(0, 1500));
      sendJson(res, upstream.status, {
        error: 'NVIDIA API request failed',
        status: upstream.status,
        details: details.slice(0, 1000),
      });
      return;
    }

    if (!upstream.body) {
      sendJson(res, 502, { error: 'NVIDIA API returned an empty response stream' });
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
        const lines = buffer.split(/\\r?\\n/);
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
              res.write(`data: ${JSON.stringify({ type: 'content', text: piece })}\\n\\n`);
            }
          } catch {
            // Ignore non-JSON keepalive/event lines from the upstream stream.
          }
        }
      }
      res.write('data: [DONE]\\n\\n');
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error: any) {
    console.error('Chat API error:', error?.message || error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'NVIDIA stream failed' })}\\n\\n`);
      res.end();
    }
  }
}
