import { describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  generateStream: vi.fn(),
  cancelGeneration: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@afg-ai/capacitor-offline-models', () => ({
  AFGOfflineModels: {
    addListener: nativeMocks.addListener,
    generateStream: nativeMocks.generateStream,
    cancelGeneration: nativeMocks.cancelGeneration,
    getRuntimeInfo: vi.fn(async () => ({ available: true, engine: 'llama.cpp', abi: 'arm64-v8a', backend: 'CPU' })),
    loadModel: vi.fn(),
    unloadModel: vi.fn(),
  },
}));

import { getNativeLlamaRuntimeInfo, loadNativeLlamaModel, streamNativeLlamaResponse } from '../src/lib/offlineLlamaRuntime';

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
