import { assertPublicHttpUrl } from '../security/publicUrl.ts';

export type NineRouterSearchType = 'web' | 'news' | 'x';

export type NineRouterSearchOptions = {
  query: string;
  maxResults?: number;
  searchTypes?: NineRouterSearchType[];
  timeRange?: 'day' | 'week' | 'month' | 'year';
  country?: string;
  language?: string;
  domainFilter?: string;
  signal?: AbortSignal;
  apiKey?: string;
};

export type NineRouterSearchSource = {
  title: string;
  url: string;
  snippet: string;
  content: string;
  score?: number;
  publishedDate?: string;
  searchType: NineRouterSearchType;
};

function getBaseUrl(): Promise<URL> {
  const configured = (process.env.NINEROUTER_BASE_URL || '').trim();
  if (!configured) throw new Error('9Router is not configured for web search.');
  const parsed = new URL(configured);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('9Router web search requires a public HTTPS base URL.');
  }
  return assertPublicHttpUrl(parsed.toString()).then((validated) => {
    const base = new URL(validated.origin);
    const prefix = validated.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '');
    base.pathname = (prefix || '') + '/v1';
    return base;
  });
}

function endpoint(base: URL, path: string): URL {
  const url = new URL(base.toString());
  url.pathname = base.pathname.replace(/\/+$/, '') + path;
  return url;
}

function authHeaders(override?: string): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  const key = (override || process.env.NINEROUTER_API_KEY || '').trim().replace(/^Bearer\s+/i, '').trim();
  if (key) headers.set('Authorization', 'Bearer ' + key);
  return headers;
}

async function readJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('9Router returned an oversized web-search response.');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value as Record<string, any>;
  } catch {
    throw new Error('9Router returned an invalid web-search response.');
  }
}

type WebModel = { id: string; kind?: string; owned_by?: string };

async function discoverModels(base: URL, signal: AbortSignal, kind: 'webSearch' | 'webFetch' = 'webSearch', apiKey?: string): Promise<WebModel[]> {
  const response = await fetch(endpoint(base, '/models/web'), {
    headers: authHeaders(apiKey),
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw new Error('9Router web-capability model discovery failed (HTTP ' + response.status + ').');
  const data = await readJson(response);
  return (Array.isArray(data.data) ? data.data : [])
    .filter((item: any) => item && typeof item.id === 'string' && item.kind === kind)
    .map((item: any) => ({ id: item.id, kind: item.kind, owned_by: item.owned_by }));
}

function selectModel(models: WebModel[], searchType: NineRouterSearchType): WebModel | undefined {
  const configured = (process.env.NINEROUTER_WEB_SEARCH_MODEL || '').trim();
  if (configured) {
    const exact = models.find((model) => model.id === configured);
    if (exact) return exact;
  }
  if (searchType === 'x') {
    return models.find((model) => /xquik/i.test((model.owned_by || '') + ' ' + model.id));
  }
  return models.find((model) => model.owned_by === 'combo') ||
    models.find((model) => /search-combo/i.test(model.id)) ||
    models.find((model) => /tavily|exa|brave|serper|searx|linkup|searchapi|youcom|perplexity/i.test((model.owned_by || '') + ' ' + model.id)) ||
    models[0];
}

function normalizeSources(data: Record<string, any>, searchType: NineRouterSearchType, maxResults: number): NineRouterSearchSource[] {
  const raw = Array.isArray(data.results) ? data.results : [];
  const seen = new Set<string>();
  const result: NineRouterSearchSource[] = [];
  for (const item of raw) {
    const url = typeof item?.url === 'string' ? item.url : '';
    if (!/^https?:\/\//i.test(url) || typeof item?.title !== 'string' || seen.has(url)) continue;
    seen.add(url);
    const snippet = typeof item.snippet === 'string' ? item.snippet
      : typeof item.description === 'string' ? item.description
      : typeof item.content === 'string' ? item.content : '';
    result.push({
      title: item.title.slice(0, 300),
      url,
      snippet: snippet.slice(0, 1600),
      content: typeof item.content === 'string' ? item.content.slice(0, 40_000) : snippet.slice(0, 1600),
      ...(typeof item.score === 'number' ? { score: item.score } : {}),
      ...(typeof item.published_at === 'string' ? { publishedDate: item.published_at.slice(0, 40) } : {}),
      searchType,
    });
    if (result.length >= maxResults) break;
  }
  return result;
}

/**
 * Uses the live web-capability catalogue exposed by 9Router. Prefer an admin-
 * configured combo (which applies 9Router's own provider fallback), then fall
 * back to a currently advertised provider model. X search is routed only when
 * an X-capable model is actually advertised by the connected 9Router instance.
 */
export async function searchNineRouter(options: NineRouterSearchOptions): Promise<{
  provider: string;
  sources: NineRouterSearchSource[];
  warnings: string[];
  responseTimeSeconds?: number;
}> {
  const query = String(options.query || '').trim().slice(0, 1000);
  if (query.length < 3) throw new Error('Provide a web-search query of at least three characters.');
  const maxResults = Math.max(1, Math.min(50, Math.floor(options.maxResults || 20)));
  const searchTypes: NineRouterSearchType[] = [...new Set(options.searchTypes?.length ? options.searchTypes : ['web'])];
  const base = await getBaseUrl();
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const models = await discoverModels(base, controller.signal, 'webSearch', options.apiKey);
    if (!models.length) throw new Error('9Router has no active web-search models. Enable a web-search provider or combo in the 9Router control panel.');
    const warnings: string[] = [];
    const calls = searchTypes.map(async (searchType) => {
      const model = selectModel(models, searchType);
      if (!model) {
        warnings.push(searchType === 'x'
          ? 'X search was skipped because no Xquik-capable model is active in 9Router.'
          : 'No compatible 9Router web-search model is active for ' + searchType + ' search.');
        return { provider: '9router', sources: [] as NineRouterSearchSource[], elapsed: 0 };
      }
      const body: Record<string, unknown> = { model: model.id, query, max_results: maxResults, search_type: searchType };
      if (options.timeRange) body.time_range = options.timeRange;
      if (options.country) body.country = options.country.slice(0, 8);
      if (options.language) body.language = options.language.slice(0, 24);
      if (options.domainFilter) body.domain_filter = options.domainFilter.slice(0, 500);
      const started = Date.now();
      const headers = authHeaders(options.apiKey);
      headers.set('Content-Type', 'application/json');
      const response = await fetch(endpoint(base, '/search'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (searchType === 'x' && (response.status === 400 || response.status === 404 || response.status === 422)) {
          warnings.push('The active 9Router X-search provider does not support this query.');
          return { provider: '9router', sources: [] as NineRouterSearchSource[], elapsed: 0 };
        }
        throw new Error('9Router ' + searchType + ' search failed (HTTP ' + response.status + ').');
      }
      const data = await readJson(response);
      const provider = typeof data.provider === 'string' ? data.provider : model.owned_by || model.id;
      return {
        provider: '9router/' + provider,
        sources: normalizeSources(data, searchType, maxResults),
        elapsed: Date.now() - started,
      };
    });
    const settled = await Promise.allSettled(calls);
    const successful = settled.filter((item): item is PromiseFulfilledResult<{provider:string;sources:NineRouterSearchSource[];elapsed:number}> => item.status === 'fulfilled');
    for (const item of settled) {
      if (item.status === 'rejected') warnings.push('One 9Router search channel failed; successful channels were retained.');
    }
    const sources = successful.flatMap((item) => item.value.sources);
    const unique = new Map<string, NineRouterSearchSource>();
    for (const source of sources) if (!unique.has(source.url)) unique.set(source.url, source);
    if (!unique.size && !successful.length) throw new Error('9Router could not complete any requested search channel.');
    const providers = [...new Set(successful.map((item) => item.value.provider))];
    const elapsed = successful.reduce((sum, item) => sum + item.value.elapsed, 0);
    return {
      provider: providers.join(', ') || '9router',
      sources: [...unique.values()].slice(0, maxResults * searchTypes.length),
      warnings,
      responseTimeSeconds: elapsed ? elapsed / 1000 : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(options.signal?.aborted ? 'Web Search was cancelled.' : '9Router web search timed out.');
    }
    throw error instanceof Error ? error : new Error('9Router web search failed.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onParentAbort);
  }
}


/**
 * Reads a public result URL through 9Router's web-fetch model catalogue
 * (for example a fetch combo, Jina Reader, Firecrawl, Exa or Tavily).
 */
export async function fetchNineRouterPage(value: string, maxCharacters = 40_000, parentSignal?: AbortSignal, apiKey?: string): Promise<{
  title: string;
  text: string;
  provider: string;
}> {
  const safeUrl = await assertPublicHttpUrl(value);
  const base = await getBaseUrl();
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const models = await discoverModels(base, controller.signal, 'webFetch', apiKey);
    if (!models.length) throw new Error('9Router has no active web-fetch models. Enable a fetch provider or fetch combo in the 9Router control panel.');
    const configured = (process.env.NINEROUTER_WEB_FETCH_MODEL || '').trim();
    const model = models.find((item) => item.id === configured) ||
      models.find((item) => item.owned_by === 'combo') ||
      models.find((item) => /fetch-combo/i.test(item.id)) ||
      models.find((item) => /jina|firecrawl|exa|tavily|ollama/i.test((item.owned_by || '') + ' ' + item.id)) ||
      models[0];
    const headers = authHeaders(apiKey);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(endpoint(base, '/web/fetch'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.id,
        url: safeUrl.toString(),
        format: 'markdown',
        max_characters: Math.max(1000, Math.min(120_000, Math.floor(maxCharacters))),
      }),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('9Router web fetch failed (HTTP ' + response.status + ').');
    const payload = await readJson(response);
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const content = data.content;
    const text = typeof content === 'string'
      ? content
      : content && typeof content.text === 'string'
        ? content.text
        : typeof data.markdown === 'string'
          ? data.markdown
          : typeof data.text === 'string' ? data.text : '';
    if (!text.trim()) throw new Error('9Router web fetch returned no readable page text.');
    return {
      title: typeof data.title === 'string' ? data.title.slice(0, 240) : safeUrl.hostname,
      text: text.slice(0, Math.max(1000, Math.min(120_000, Math.floor(maxCharacters)))),
      provider: typeof payload.provider === 'string' ? payload.provider : model.owned_by || model.id,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(parentSignal?.aborted ? 'Page reading was cancelled.' : '9Router page reading timed out.');
    }
    throw error instanceof Error ? error : new Error('9Router could not read this page.');
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
