import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateRequest } from './auth.ts';
import { pool } from './database.ts';
import { getIntegrationRuntime } from './connections.ts';
import { searchNineRouter, type NineRouterSearchType } from '../services/nineRouterWebSearch.ts';

const MAX_QUERY_LENGTH = 500;
let activeSearches = 0;
const searchRate = new Map<string, { startedAt: number; count: number }>();

function reply(res: ServerResponse, status: number, payload: unknown, requestId: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
  res.end(JSON.stringify({ ...payload as object, requestId }));
}

const ChatWebSearchInput = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  max_results: z.number().int().min(1).max(50).optional(),
  time_range: z.enum(['day','week','month','year']).optional(),
  search_type: z.enum(['web','news','x']).optional(),
  country: z.string().trim().max(8).optional(),
  language: z.string().trim().max(24).optional(),
  domain_filter: z.string().trim().max(500).optional(),
}).strict();

type WebSearchRuntime = { provider: '9router' | 'tavily' | 'brave' | 'serpapi'; apiKey: string; integrationId: string | null };

async function resolveWebSearchRuntime(): Promise<WebSearchRuntime> {
  const nineRouterConfigured = Boolean(process.env.NINEROUTER_BASE_URL?.trim());
  let integrationId: string | null = null;
  if (pool) {
    const status = await pool.query("SELECT id,enabled,status,last_check_ok FROM integrations WHERE slug='web-search' LIMIT 1");
    if (status.rows[0]) {
      const verified = status.rows[0].enabled && status.rows[0].status === 'active' && status.rows[0].last_check_ok === true;
      if (!verified && !nineRouterConfigured) {
        throw new Error('The Web Search connection is not verified and enabled. Configure 9Router web-search models or ask an administrator to check Admin → Connections.');
      }
      if (verified) integrationId = String(status.rows[0].id);
    }
  }
  const runtime = await getIntegrationRuntime('web-search');
  const provider = String(runtime?.config.provider || (nineRouterConfigured ? '9router' : 'tavily'));
  if (provider === '9router') {
    if (!nineRouterConfigured) throw new Error('9Router web search requires NINEROUTER_BASE_URL.');
    return { provider: '9router', apiKey: '', integrationId };
  }
  if (!['tavily', 'brave', 'serpapi'].includes(provider)) throw new Error('The configured Web Search provider is not supported.');
  const apiKey = runtime?.credentials.api_key || process.env.TAVILY_API_KEY || '';
  if (!apiKey) throw new Error('Web Search is not configured. Connect a search provider in Admin → Connections or configure 9Router.');
  return { provider: provider as WebSearchRuntime['provider'], apiKey, integrationId };
}

async function enforceWebSearchRateLimit(runtime: WebSearchRuntime, userId: string): Promise<void> {
  if (!runtime.integrationId || !pool) return;
  const policy = await pool.query('SELECT requests,window_seconds FROM integration_rate_limits WHERE integration_id=$1', [runtime.integrationId]);
  const maxRequests = Math.max(1, Number(policy.rows[0]?.requests || 12));
  const windowSeconds = Math.max(1, Number(policy.rows[0]?.window_seconds || 60));
  const counter = await pool.query(`INSERT INTO integration_rate_counters(integration_id,user_id,window_start,request_count)
    VALUES($1,$2,to_timestamp((floor(extract(epoch FROM now())/$3)*$3)::double precision),1)
    ON CONFLICT(integration_id,user_id,window_start) DO UPDATE SET request_count=integration_rate_counters.request_count+1
    RETURNING request_count`, [runtime.integrationId, userId, windowSeconds]);
  if (Number(counter.rows[0]?.request_count || 0) > maxRequests) {
    throw new Error('Web Search integration rate limit reached. Please retry after the current window.');
  }
}

export async function executeWebSearchTool(userId: string, args: unknown, parentSignal?: AbortSignal) {
  if (!userId) throw new Error('Sign in is required to search the web.');
  const input = ChatWebSearchInput.safeParse(args);
  if (!input.success) throw new Error('Provide a valid web-search query and supported filters.');

  const runtime = await resolveWebSearchRuntime();
  const { provider, apiKey } = runtime;
  await enforceWebSearchRateLimit(runtime, userId);
  if (activeSearches >= 3) throw new Error('Web Search is busy. Please retry shortly.');

  activeSearches += 1;
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const query = input.data.query;
    const maxResults = input.data.max_results || 20;
    if (provider === '9router') {
      const result = await searchNineRouter({
        query,
        maxResults,
        searchTypes: [input.data.search_type || 'web'],
        timeRange: input.data.time_range,
        country: input.data.country,
        language: input.data.language,
        domainFilter: input.data.domain_filter,
        signal: controller.signal,
      });
      return { provider: result.provider, query, sourceCount: result.sources.length, sources: result.sources, warnings: result.warnings, responseTimeSeconds: result.responseTimeSeconds };
    }
    let endpoint: string;
    let init: RequestInit;
    if (provider === 'brave') {
      endpoint = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + maxResults;
      init = { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: controller.signal, redirect: 'error' };
    } else if (provider === 'serpapi') {
      endpoint = 'https://serpapi.com/search.json?engine=google&q=' + encodeURIComponent(query) + '&num=' + maxResults + '&api_key=' + encodeURIComponent(apiKey);
      init = { signal: controller.signal, redirect: 'error' };
    } else if (provider === 'tavily') {
      endpoint = 'https://api.tavily.com/search';
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'advanced',
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
          ...(input.data.time_range ? { time_range: input.data.time_range } : {}),
        }),
      };
    } else {
      throw new Error('The configured Web Search provider is not supported.');
    }

    const upstream = await fetch(endpoint, init);
    if (!upstream.ok) {
      const reason = upstream.status === 401 || upstream.status === 403
        ? 'The Web Search API key was rejected.'
        : upstream.status === 429
          ? 'The Web Search provider rate limit or credit quota was reached.'
          : 'The Web Search provider returned an error (HTTP ' + upstream.status + ').';
      throw new Error(reason);
    }

    const data = await upstream.json() as any;
    const rawResults = provider === 'brave' ? data.web?.results : provider === 'serpapi' ? data.organic_results : data.results;
    const sources = Array.isArray(rawResults) ? rawResults.filter((item: any) => {
      const url = item?.url || item?.link;
      return typeof url === 'string' && /^https?:\/\//i.test(url) && typeof item.title === 'string';
    }).slice(0, maxResults).map((item: any) => ({
      title: String(item.title).slice(0, 300),
      url: String(item.url || item.link),
      snippet: typeof (item.content || item.description || item.snippet) === 'string'
        ? String(item.content || item.description || item.snippet).slice(0, 1200)
        : '',
      ...(typeof item.score === 'number' ? { score: item.score } : {}),
      ...(typeof item.published_date === 'string' ? { publishedDate: item.published_date.slice(0, 40) } : {}),
    })) : [];

    return {
      provider,
      query,
      sourceCount: sources.length,
      sources,
      responseTimeSeconds: typeof data.response_time === 'number' ? data.response_time : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(parentSignal?.aborted ? 'Web Search was cancelled.' : 'Web Search timed out after 15 seconds.');
    }
    throw error instanceof Error ? error : new Error('Web Search failed.');
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
    activeSearches = Math.max(0, activeSearches - 1);
  }
}

export type WebSearchSource = {
  title: string;
  url: string;
  snippet: string;
  content: string;
  score?: number;
  publishedDate?: string;
};

/**
 * Content-returning search used by deep research. It shares the verified
 * Web Search connection, rate limits and provider policy with the chat tool.
 * Full extracted page content is returned only when the provider supplies it;
 * it remains untrusted reference data.
 */
export async function searchWebSources(
  userId: string,
  options: { query: string; maxResults?: number; includeContent?: boolean; timeRange?: 'day' | 'week' | 'month' | 'year'; searchTypes?: NineRouterSearchType[]; country?: string; language?: string; domainFilter?: string },
  parentSignal?: AbortSignal,
): Promise<{ provider: string; query: string; sources: WebSearchSource[]; warnings?: string[]; responseTimeSeconds?: number }> {
  if (!userId) throw new Error('Sign in is required to search the web.');
  const query = String(options.query || '').trim().slice(0, MAX_QUERY_LENGTH);
  if (query.length < 3) throw new Error('Provide a web-search query of at least three characters.');
  const maxResults = Math.max(1, Math.min(50, Number(options.maxResults || 20)));
  const runtime = await resolveWebSearchRuntime();
  const { provider, apiKey } = runtime;
  await enforceWebSearchRateLimit(runtime, userId);
  if (activeSearches >= 3) throw new Error('Web Search is busy. Please retry shortly.');

  activeSearches += 1;
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    if (provider === '9router') {
      const result = await searchNineRouter({
        query,
        maxResults,
        searchTypes: options.searchTypes,
        timeRange: options.timeRange,
        country: options.country,
        language: options.language,
        domainFilter: options.domainFilter,
        signal: controller.signal,
      });
      return { provider: result.provider, query, sources: result.sources, warnings: result.warnings, responseTimeSeconds: result.responseTimeSeconds };
    }
    let endpoint: string;
    let init: RequestInit;
    if (provider === 'brave') {
      endpoint = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + maxResults;
      init = { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: controller.signal, redirect: 'error' };
    } else if (provider === 'serpapi') {
      endpoint = 'https://serpapi.com/search.json?engine=google&q=' + encodeURIComponent(query) + '&num=' + maxResults + '&api_key=' + encodeURIComponent(apiKey);
      init = { signal: controller.signal, redirect: 'error' };
    } else {
      endpoint = 'https://api.tavily.com/search';
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'advanced',
          max_results: maxResults,
          include_answer: false,
          include_raw_content: options.includeContent ? 'markdown' : false,
          ...(options.timeRange ? { time_range: options.timeRange } : {}),
        }),
      };
    }
    const upstream = await fetch(endpoint, init);
    if (!upstream.ok) {
      const reason = upstream.status === 401 || upstream.status === 403
        ? 'The Web Search API key was rejected.'
        : upstream.status === 429
          ? 'The Web Search provider rate limit or credit quota was reached.'
          : 'The Web Search provider returned an error (HTTP ' + upstream.status + ').';
      throw new Error(reason);
    }
    const data = await upstream.json() as any;
    const rawResults = provider === 'brave' ? data.web?.results : provider === 'serpapi' ? data.organic_results : data.results;
    const sources: WebSearchSource[] = Array.isArray(rawResults)
      ? rawResults.filter((item: any) => {
          const url = item?.url || item?.link;
          return typeof url === 'string' && /^https?:\/\//i.test(url) && typeof item.title === 'string';
        }).slice(0, maxResults).map((item: any) => {
          const snippet = typeof (item.content || item.description || item.snippet) === 'string'
            ? String(item.content || item.description || item.snippet).slice(0, 1600)
            : '';
          const extracted = options.includeContent && typeof item.raw_content === 'string'
            ? String(item.raw_content).slice(0, 40_000)
            : '';
          const published = item.published_date || item.date || item.age;
          return {
            title: String(item.title).slice(0, 300),
            url: String(item.url || item.link),
            snippet,
            content: extracted || snippet,
            ...(typeof item.score === 'number' ? { score: item.score } : {}),
            ...(typeof published === 'string' ? { publishedDate: published.slice(0, 40) } : {}),
          };
        })
      : [];
    return {
      provider,
      query,
      sources,
      responseTimeSeconds: typeof data.response_time === 'number' ? data.response_time : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(parentSignal?.aborted ? 'Web Search was cancelled.' : 'Web Search timed out.');
    }
    throw error instanceof Error ? error : new Error('Web Search failed.');
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
    activeSearches = Math.max(0, activeSearches - 1);
  }
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
  let runtime: WebSearchRuntime;
  try { runtime = await resolveWebSearchRuntime(); }
  catch (error) {
    reply(res, 503, { available: false, error: error instanceof Error ? error.message : 'Web Search is not configured.' }, requestId);
    return true;
  }
  const provider = runtime.provider;
  const apiKey = runtime.apiKey;
  if (provider !== '9router' && !apiKey) {
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
    const input = z.object({
      query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
      max_results: z.number().int().min(1).max(50).optional(),
      search_type: z.enum(['web','news','x']).optional(),
      time_range: z.enum(['day','week','month','year']).optional(),
      country: z.string().trim().max(8).optional(),
      language: z.string().trim().max(24).optional(),
      domain_filter: z.string().trim().max(500).optional(),
    }).strict().safeParse(body);
    if (!input.success) {
      reply(res, 400, { error: 'Enter a research query of up to 500 characters.' }, requestId);
      return true;
    }
    const query = input.data.query;
    if (provider === '9router') {
      const result = await searchNineRouter({
        query,
        maxResults: input.data.max_results || 20,
        searchTypes: [input.data.search_type || 'web'],
        timeRange: input.data.time_range,
        country: input.data.country,
        language: input.data.language,
        domainFilter: input.data.domain_filter,
        signal: controller.signal,
      });
      reply(res, 200, { available: true, query, provider: result.provider, sources: result.sources, sourceCount: result.sources.length, warnings: result.warnings }, requestId);
      return true;
    }
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
    reply(res, 200, { available: true, query, provider, sources: results, sourceCount: results.length, message: results.length ? 'Search results returned by ' + provider + '.' : 'The search provider returned no verifiable URLs.' }, requestId);
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
