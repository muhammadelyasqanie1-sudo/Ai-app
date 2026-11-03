export type HuggingFaceModel = {
  id: string;
  sha: string | null;
  downloads: number;
  likes: number;
  pipeline_tag: string | null;
  tags: string[];
  lastModified: string | null;
  private: boolean;
  gated: boolean | string;
};

export type HuggingFaceFile = {
  path: string;
  size: number | null;
  lfs?: { size?: number; sha256?: string; oid?: string };
  type?: string;
};

export type HuggingFaceRepository = {
  id: string;
  revision: string;
  files: HuggingFaceFile[];
  totalBytes: number;
  ggufFiles: Array<{ name: string; path: string; size: number | null; quantization: string | null; sha256: string | null }>;
};

const API = 'https://huggingface.co/api';
const CACHE_PREFIX = 'afg-hf-catalog-v1:';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 40;

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    return Date.now() - parsed.at < CACHE_TTL ? parsed.value : null;
  } catch { return null; }
}

function safeWrite<T>(key: string, value: T): void {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch { /* quota/private mode */ }
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (response.status === 429) {
        throw Object.assign(new Error('Hugging Face rate limit reached. Wait briefly and retry.'), { retryable: false });
      }
      if (response.status >= 500 && response.status <= 599) {
        const detail = (await response.text()).slice(0, 200);
        throw Object.assign(new Error('Hugging Face server error (' + response.status + ')' + (detail ? ': ' + detail : '.')), { retryable: true });
      }
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw Object.assign(new Error('Hugging Face request failed (' + response.status + ')' + (detail ? ': ' + detail : '.')), { retryable: false });
      }
      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (timedOut) lastError = new Error('Hugging Face request timed out after 20 seconds.');
      const retryable = timedOut || !(error instanceof Error && 'retryable' in error && (error as Error & { retryable: boolean }).retryable === false);
      if (!retryable || attempt === maxAttempts - 1) break;
      const baseDelay = Math.min(8000, 500 * (2 ** attempt));
      const jitter = Math.floor(Math.random() * Math.max(1, baseDelay * 0.25));
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener('abort', cancel);
        const timer = window.setTimeout(() => { cleanup(); resolve(); }, baseDelay + jitter);
        const cancel = () => {
          window.clearTimeout(timer);
          cleanup();
          reject(new DOMException('The request was cancelled.', 'AbortError'));
        };
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
      });
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Hugging Face catalog request failed after retries.');
}

export async function searchHuggingFaceGGUF(options: {
  query?: string;
  format?: 'gguf' | 'all';
  page?: number;
  sort?: 'downloads' | 'likes' | 'lastModified';
  direction?: 'asc' | 'desc';
  signal?: AbortSignal;
} = {}): Promise<{ items: HuggingFaceModel[]; page: number; hasMore: boolean }> {
  const page = Math.max(0, options.page || 0);
  const query = (options.query || '').trim();
  const format = options.format || 'gguf';
  const cacheKey = [format, query.toLowerCase(), page, options.sort || 'downloads', options.direction || 'desc'].join(':');
  const cached = safeRead<{ items: HuggingFaceModel[]; page: number; hasMore: boolean }>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    ...(format === 'gguf' ? { filter: 'gguf' } : {}),
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    sort: options.sort || 'downloads',
    direction: options.direction === 'asc' ? '1' : '-1',
    full: 'true',
    ...(query ? { search: query } : {}),
  });
  const raw = await request<unknown>(API + '/models?' + params.toString(), options.signal);
  if (!Array.isArray(raw)) {
    throw new Error('Hugging Face returned an unexpected model-catalog response. Please retry.');
  }
  const items = raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item): HuggingFaceModel => ({
    id: String(item.id || ''),
    sha: typeof item.sha === 'string' ? item.sha : null,
    downloads: Number(item.downloads || 0),
    likes: Number(item.likes || 0),
    pipeline_tag: typeof item.pipeline_tag === 'string' ? item.pipeline_tag : null,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    lastModified: typeof item.lastModified === 'string' ? item.lastModified : null,
    private: item.private === true,
    gated: item.gated === true || typeof item.gated === 'string' ? item.gated as boolean | string : false,
  })).filter(item => item.id && !item.private && (format === 'gguf' || !item.pipeline_tag || ['text-generation','text2text-generation','conversational','fill-mask','feature-extraction'].includes(item.pipeline_tag)));
  const result = { items, page, hasMore: raw.length === PAGE_SIZE };
  safeWrite(cacheKey, result);
  return result;
}

export async function getHuggingFaceRepository(repoId: string, signal?: AbortSignal, revision = 'main'): Promise<HuggingFaceRepository> {
  if (!/^[^/]+\/[^/]+$/.test(repoId)) throw new Error('Invalid Hugging Face repository ID.');
  const cacheKey = 'tree:' + repoId + ':' + revision;
  const cached = safeRead<HuggingFaceRepository>(cacheKey);
  if (cached) return cached;

  const files = await request<Array<Record<string, unknown>>>(API + '/models/' + encodeURIComponent(repoId).replace('%2F', '/') + '/tree/' + encodeURIComponent(revision) + '?recursive=true&expand=true', signal);
  const normalized: HuggingFaceFile[] = files.filter(file => file.type !== 'directory').map(file => ({
    path: String(file.path || ''),
    size: typeof file.size === 'number' ? file.size : typeof (file.lfs as Record<string, unknown> | undefined)?.size === 'number' ? Number((file.lfs as Record<string, unknown>).size) : null,
    lfs: file.lfs && typeof file.lfs === 'object' ? file.lfs as HuggingFaceFile['lfs'] : undefined,
    type: typeof file.type === 'string' ? file.type : undefined,
  }));
  const ggufFiles = normalized.filter(file => file.path.toLowerCase().endsWith('.gguf')).map(file => {
    const name = file.path.split('/').pop() || file.path;
    const match = name.match(/(?:^|[-_.])(Q[0-9]+(?:_[KMS](?:_[MS])?|_[0-9]+)?|IQ[0-9]+_[A-Z0-9_]+|F16|F32)(?:[-_.]|$)/i);
    const oid = file.lfs?.oid || '';
    const sha = file.lfs?.sha256 || (oid.startsWith('sha256:') ? oid.slice(7) : /^[a-f0-9]{64}$/i.test(oid) ? oid : null);
    return { name, path: file.path, size: file.size, quantization: match?.[1]?.toUpperCase() || null, sha256: sha };
  });
  const quantizationPriority = (name: string) => /Q4_K_M/i.test(name) ? 0 : /Q4_K_S|Q4_0/i.test(name) ? 1 : /Q5/i.test(name) ? 2 : /Q6/i.test(name) ? 3 : /Q8/i.test(name) ? 4 : 5;
  ggufFiles.sort((a, b) => quantizationPriority(a.name) - quantizationPriority(b.name));
  const result = { id: repoId, revision, files: normalized, totalBytes: normalized.reduce((sum, file) => sum + (file.size || 0), 0), ggufFiles };
  safeWrite(cacheKey, result);
  return result;
}

export function formatModelCategory(tags: string[], pipeline: string | null, modelId = ''): string[] {
  const source = [modelId, pipeline || '', ...tags].join(' ').toLowerCase().replace(/[-_/.:]+/g, ' ');
  const categories: string[] = [];
  if (/\b(education|educational|learning|teaching|tutor)\b/.test(source)) categories.push('learning');
  if (/\b(code|coding|programming|developer|software|debug|javascript|typescript|python|java|rust|sql)\b/.test(source)) categories.push('coding');
  if (/\b(english|grammar|vocabulary|translation|language learning|ielts|toefl|esl)\b/.test(source)) categories.push('english', 'learning');
  if (/\b(robot|robotics|ros|autonomous|navigation|actuator|kinematics|slam)\b/.test(source)) categories.push('robotics', 'learning');
  if (/\b(math|mathematics|algebra|geometry|calculus|arithmetic|theorem|equation)\b/.test(source)) categories.push('mathematics', 'learning');
  if (/\b(science|physics|chemistry|biology|astronomy|geology|scientific)\b/.test(source)) categories.push('science', 'learning');
  if (/\b(creative|writing|story|poetry|novel|screenplay|copywriting)\b/.test(source)) categories.push('creative');
  return categories.length ? Array.from(new Set(categories)) : ['general'];
}
