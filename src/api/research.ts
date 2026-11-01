import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

const MAX_QUERY_LENGTH = 500;
let activeSearches = 0;

function reply(res: ServerResponse, status: number, payload: unknown, requestId: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
  res.end(JSON.stringify({ ...payload as object, requestId }));
}

export async function handleResearchApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url?.startsWith('/api/research')) return false;
  const requestId = randomUUID();
  if (req.method !== 'POST') {
    reply(res, 405, { error: 'Method not allowed.' }, requestId);
    return true;
  }
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    reply(res, 503, { available: false, error: 'Web Research is disabled. Configure TAVILY_API_KEY on the server.' }, requestId);
    return true;
  }
  if (activeSearches >= 3) {
    reply(res, 503, { available: true, error: 'Research is busy. Please retry shortly.' }, requestId);
    return true;
  }
  activeSearches += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += chunk.length;
      if (size > 16_000) {
        reply(res, 413, { error: 'Research request is too large.' }, requestId);
        return true;
      }
      chunks.push(chunk);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad body');
      body = parsed as Record<string, unknown>;
    } catch {
      reply(res, 400, { error: 'A valid JSON request is required.' }, requestId);
      return true;
    }
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > MAX_QUERY_LENGTH) {
      reply(res, 400, { error: 'Enter a research query of up to 500 characters.' }, requestId);
      return true;
    }
    const upstream = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ api_key: apiKey, query, search_depth: 'advanced', max_results: 8, include_answer: false, include_raw_content: false }),
    });
    if (!upstream.ok) {
      console.error('AFG_RESEARCH_PROVIDER_FAILED', JSON.stringify({ requestId, status: upstream.status }));
      reply(res, 502, { available: true, error: 'The configured search provider could not complete this search.' }, requestId);
      return true;
    }
    const data = await upstream.json() as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
    const results = Array.isArray(data.results) ? data.results.filter((item) =>
      typeof item.url === 'string' && /^https?:\/\//i.test(item.url) && typeof item.title === 'string',
    ).map((item) => ({
      title: item.title!.slice(0, 300),
      url: item.url!,
      snippet: typeof item.content === 'string' ? item.content.slice(0, 1200) : '',
      score: typeof item.score === 'number' ? item.score : undefined,
    })) : [];
    reply(res, 200, { available: true, query, sources: results, sourceCount: results.length, message: results.length ? 'Search results returned by Tavily.' : 'The search provider returned no verifiable URLs.' }, requestId);
    return true;
  } catch (error) {
    console.error('AFG_RESEARCH_REQUEST_FAILED', JSON.stringify({ requestId, code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request_failed' }));
    reply(res, 502, { error: 'Research could not be completed. Please retry.' }, requestId);
    return true;
  } finally {
    clearTimeout(timeout);
    activeSearches = Math.max(0, activeSearches - 1);
  }
}
