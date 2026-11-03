import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));

import { getNativeLlamaRuntimeInfo, loadNativeLlamaModel } from '../src/lib/offlineLlamaRuntime';

describe('offline llama runtime', () => {
  it('reports native inference unavailable on web', async () => {
    const info = await getNativeLlamaRuntimeInfo();
    expect(info.available).toBe(false);
    expect(info.abi).toBe('web');
  });

  it('rejects attempts to load the Android native runtime on web', async () => {
    await expect(loadNativeLlamaModel('/models/model.gguf')).rejects.toThrow(/Android app/i);
  });
});
