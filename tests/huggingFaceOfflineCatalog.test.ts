import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchHuggingFaceGGUF } from '../src/lib/huggingFaceOfflineCatalog';

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

  it('does not retry a rate-limit response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchHuggingFaceGGUF({ query: 'rate-limit-test' })).rejects.toThrow(/rate limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
