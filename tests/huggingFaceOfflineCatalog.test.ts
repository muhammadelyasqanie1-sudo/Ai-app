import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGgufModels, fetchModelFiles, searchHuggingFaceGGUF } from '../src/lib/huggingFaceOfflineCatalog';

describe('Hugging Face offline catalog', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retries transient 5xx responses with backoff and returns normalized catalog data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporary error', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'owner/model', downloads: 12, likes: 2, tags: ['gguf'] }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchHuggingFaceGGUF({ query: 'model' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.items[0]?.id).toBe('owner/model');
    expect(result.hasMore).toBe(false);
  });


  it('retries transient network failures and paginates with the documented offset', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({ id: 'owner/model-' + index, downloads: index, tags: ['gguf'] }));
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchHuggingFaceGGUF({ query: 'network-retry-test', page: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('offset=40');
    expect(result.items).toHaveLength(40);
    expect(result.hasMore).toBe(true);
  });

  it('exposes cursor pagination through fetchGgufModels', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ id: 'cursor/model-' + index, downloads: index, tags: ['gguf'] }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchGgufModels({ search: 'cursor-api-test', limit: 30 });
    expect(first.models).toHaveLength(30);
    expect(first.nextCursor).toBe('30');
    const second = await fetchGgufModels({ search: 'cursor-api-test', limit: 30, cursor: first.nextCursor });
    expect(second.nextCursor).toBe('30');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('offset=30');
  });

  it('returns GGUF file sizes and direct download URLs from repository metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { type: 'file', path: 'Spark-X2.6-Q4_K_M.gguf', size: 1090000000, lfs: { oid: 'a'.repeat(64) } },
      { type: 'file', path: 'README.md', size: 100 },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const files = await fetchModelFiles('AtomicChat/Spark-X2.6-1.7B-GGUF', 'main');
    expect(files).toHaveLength(1);
    expect(files[0]?.size).toBe(1090000000);
    expect(files[0]?.quantization).toBe('Q4_K_M');
    expect(files[0]?.downloadUrl).toContain('/resolve/main/Spark-X2.6-Q4_K_M.gguf');
  });

  it('assigns all supported top-level categories through the catalog classifier', async () => {
    const { formatModelCategory } = await import('../src/lib/huggingFaceOfflineCatalog');
    expect(formatModelCategory(['python', 'coding'], null)).toContain('coding');
    expect(formatModelCategory(['creative-writing'], null)).toContain('creative');
    expect(formatModelCategory([], null)).toEqual(['general']);
    expect(formatModelCategory(['science', 'physics'], null)).toContain('science');
    expect(formatModelCategory(['english', 'grammar'], null)).toContain('english');
    expect(formatModelCategory(['robotics'], null)).toContain('robotics');
    expect(formatModelCategory(['mathematics'], null)).toContain('mathematics');
  });

  it('does not retry a rate-limit response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchHuggingFaceGGUF({ query: 'rate-limit-test' })).rejects.toThrow(/rate limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
