export type HuggingFaceModel = {
  id: string;
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
  files: HuggingFaceFile[];
  totalBytes: number;
  ggufFiles: Array<{ name: string; size: number | null; quantization: string | null; sha256: string | null }>;
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
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (response.status === 429) throw new Error('Hugging Face rate limit reached. Wait briefly and retry.');
  if (!response.ok) throw new Error('Hugging Face request failed (' + response.status + ').');
  return response.json() as Promise<T>;
}

export async function searchHuggingFaceGGUF(options: {
  query?: string;
  page?: number;
  sort?: 'downloads' | 'likes' | 'lastModified';
  direction?: 'asc' | 'desc';
  signal?: AbortSignal;
} = {}): Promise<{ items: HuggingFaceModel[]; page: number; hasMore: boolean }> {
  const page = Math.max(0, options.page || 0);
  const query = (options.query || '').trim();
  const cacheKey = [query.toLowerCase(), page, options.sort || 'downloads', options.direction || 'desc'].join(':');
  const cached = safeRead<{ items: HuggingFaceModel[]; page: number; hasMore: boolean }>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    filter: 'gguf',
    limit: String(PAGE_SIZE),
    sort: options.sort || 'downloads',
    direction: options.direction === 'asc' ? '1' : '-1',
    full: 'true',
    ...(query ? { search: query } : {}),
  });
  const raw = await request<Array<Record<string, unknown>>>(API + '/models?' + params.toString(), options.signal);
  const items = raw.map((item): HuggingFaceModel => ({
    id: String(item.id || ''),
    downloads: Number(item.downloads || 0),
    likes: Number(item.likes || 0),
    pipeline_tag: typeof item.pipeline_tag === 'string' ? item.pipeline_tag : null,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    lastModified: typeof item.lastModified === 'string' ? item.lastModified : null,
    private: item.private === true,
    gated: item.gated === true || typeof item.gated === 'string' ? item.gated as boolean | string : false,
  })).filter(item => item.id && !item.private);
  const result = { items, page, hasMore: raw.length === PAGE_SIZE };
  safeWrite(cacheKey, result);
  return result;
}

export async function getHuggingFaceRepository(repoId: string, signal?: AbortSignal): Promise<HuggingFaceRepository> {
  if (!/^[^/]+\/[^/]+$/.test(repoId)) throw new Error('Invalid Hugging Face repository ID.');
  const cacheKey = 'tree:' + repoId;
  const cached = safeRead<HuggingFaceRepository>(cacheKey);
  if (cached) return cached;

  const files = await request<Array<Record<string, unknown>>>(API + '/models/' + encodeURIComponent(repoId).replace('%2F', '/') + '/tree/main?recursive=true&expand=true', signal);
  const normalized: HuggingFaceFile[] = files.filter(file => file.type !== 'directory').map(file => ({
    path: String(file.path || ''),
    size: typeof file.size === 'number' ? file.size : typeof (file.lfs as Record<string, unknown> | undefined)?.size === 'number' ? Number((file.lfs as Record<string, unknown>).size) : null,
    lfs: file.lfs && typeof file.lfs === 'object' ? file.lfs as HuggingFaceFile['lfs'] : undefined,
    type: typeof file.type === 'string' ? file.type : undefined,
  }));
  const ggufFiles = normalized.filter(file => file.path.toLowerCase().endsWith('.gguf')).map(file => {
    const name = file.path.split('/').pop() || file.path;
    const match = name.match(/(?:^|[-_.])(Q[0-9]+(?:_[KMS]_[MS]|_[0-9]+)?|IQ[0-9]+_[A-Z0-9_]+|F16|F32)(?:[-_.]|$)/i);
    const sha = file.lfs?.sha256 || (file.lfs?.oid?.startsWith('sha256:') ? file.lfs.oid.slice(7) : null);
    return { name, size: file.size, quantization: match?.[1]?.toUpperCase() || null, sha256: sha };
  });
  const result = { id: repoId, files: normalized, totalBytes: normalized.reduce((sum, file) => sum + (file.size || 0), 0), ggufFiles };
  safeWrite(cacheKey, result);
  return result;
}

export function formatModelCategory(tags: string[], pipeline: string | null): string[] {
  const source = [...tags, pipeline || ''].join(' ').toLowerCase();
  const categories: string[] = [];
  if (/code|coding|programming/.test(source)) categories.push('coding');
  if (/math|science|physics|chemistry|biology|education/.test(source)) categories.push('learning');
  if (/creative|writing|story|poetry/.test(source)) categories.push('creative');
  if (!categories.length) categories.push('general');
  return categories;
}
