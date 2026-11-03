import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateRequest } from './auth.ts';
import { pool } from './database.ts';
import { getIntegrationRuntime } from './connections.ts';

const MAX_QUERY_LENGTH = 500;
let activeSearches = 0;
const searchRate = new Map<string, { startedAt: number; count: number }>();

function reply(res: ServerResponse, status: number, payload: unknown, requestId: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
  res.end(JSON.stringify({ ...payload as object, requestId }));
}

export async function handleResearchApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname !== '/api/research') return false;
  const requestId = randomUUID();
  const user = await authenticateRequest(req);
  if (!user) { reply(res,401,{error:'Sign in is required to use Web Research.'},requestId); return true; }
  if (req.method !== 'POST') {
    reply(res, 405, { error: 'Method not allowed.' }, requestId);
    return true;
  }
  if (pool) {
    const integration = await pool.query("SELECT id FROM integrations WHERE slug='web-search' AND enabled=true AND status='active' AND last_check_ok=true LIMIT 1");
    if (integration.rows[0]) {
      const policy = await pool.query('SELECT requests,window_seconds FROM integration_rate_limits WHERE integration_id=$1',[integration.rows[0].id]);
      const maxRequests = Number(policy.rows[0]?.requests || 12);
      const windowSeconds = Number(policy.rows[0]?.window_seconds || 60);
      const counter = await pool.query(`INSERT INTO integration_rate_counters(integration_id,user_id,window_start,request_count)
        VALUES($1,$2,to_timestamp((floor(extract(epoch FROM now())/$3)*$3)::double precision),1)
        ON CONFLICT(integration_id,user_id,window_start) DO UPDATE SET request_count=integration_rate_counters.request_count+1
        RETURNING request_count`,[integration.rows[0].id,user.id,windowSeconds]);
      if (Number(counter.rows[0]?.request_count||0)>maxRequests) {
        reply(res,429,{error:'Web Search integration rate limit reached. Please retry after the current window.'},requestId);return true;
      }
    }
  }
  const clientKey = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowState = searchRate.get(clientKey);
  if (!windowState || now - windowState.startedAt >= 60_000) searchRate.set(clientKey, { startedAt: now, count: 1 });
  else if (windowState.count >= 12) {
    reply(res, 429, { error: 'Research rate limit reached. Please wait a minute before trying again.' }, requestId);
    return true;
  } else windowState.count += 1;
  if (searchRate.size > 500) {
    for (const [key, value] of searchRate) if (now - value.startedAt >= 60_000) searchRate.delete(key);
  }
  const runtime = await getIntegrationRuntime('web-search');
  const provider = String(runtime?.config.provider || 'tavily');
  const apiKey = runtime?.credentials.api_key || (process.env.TAVILY_API_KEY || '');
  if (!apiKey) {
    reply(res, 503, { available: false, error: 'Web Research is disabled. Configure and verify a Web Search connection in Admin → Connections.' }, requestId);
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
    const input = z.object({query:z.string().trim().min(1).max(MAX_QUERY_LENGTH)}).strict().safeParse(body);
    if (!input.success) {
      reply(res, 400, { error: 'Enter a research query of up to 500 characters.' }, requestId);
      return true;
    }
    const query = input.data.query;
    let endpoint: string;
    let init: RequestInit;
    if (provider === 'brave') {
      endpoint = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=8';
      init = {headers:{'X-Subscription-Token':apiKey,Accept:'application/json'},signal:controller.signal};
    } else if (provider === 'serpapi') {
      endpoint = 'https://serpapi.com/search.json?engine=google&q=' + encodeURIComponent(query) + '&api_key=' + encodeURIComponent(apiKey);
      init = {signal:controller.signal};
    } else {
      endpoint = 'https://api.tavily.com/search';
      init = {method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({api_key:apiKey,query,search_depth:'advanced',max_results:8,include_answer:false,include_raw_content:false})};
    }
    const upstream = await fetch(endpoint,init);
    if (!upstream.ok) {
      console.error('AFG_RESEARCH_PROVIDER_FAILED', JSON.stringify({ requestId, status: upstream.status, provider }));
      reply(res, 502, { available: true, error: 'The configured search provider could not complete this search.' }, requestId);
      return true;
    }
    const data = await upstream.json() as any;
    const rawResults = provider==='brave' ? data.web?.results : provider==='serpapi' ? data.organic_results : data.results;
    const results = Array.isArray(rawResults) ? rawResults.filter((item:any) =>
      typeof (item.url||item.link) === 'string' && /^https?:\/\//i.test(item.url||item.link) && typeof item.title === 'string',
    ).map((item:any) => ({
      title: item.title.slice(0,300),
      url: item.url||item.link,
      snippet: typeof (item.content||item.description||item.snippet) === 'string' ? (item.content||item.description||item.snippet).slice(0,1200) : '',
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
