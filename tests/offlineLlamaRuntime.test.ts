import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  generateStream: vi.fn(),
  cancelGeneration: vi.fn(),
  getRuntimeInfo: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@afg-ai/capacitor-offline-models', () => ({
  AFGOfflineModels: {
    addListener: nativeMocks.addListener,
    generateStream: nativeMocks.generateStream,
    cancelGeneration: nativeMocks.cancelGeneration,
    getRuntimeInfo: nativeMocks.getRuntimeInfo,
  },
}));

import { getNativeLlamaRuntimeInfo, streamNativeLlamaResponse } from '../src/lib/offlineLlamaRuntime';

describe('offline llama runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMocks.getRuntimeInfo.mockResolvedValue({ available: true, engine: 'llama.cpp', abi: 'arm64-v8a', backend: 'CPU' });
    nativeMocks.addListener.mockResolvedValue({ remove: vi.fn() });
    nativeMocks.generateStream.mockResolvedValue({ text: 'Hello world', cancelled: false });
    nativeMocks.cancelGeneration.mockResolvedValue({ cancelled: true });
  });

  it('reports the native llama.cpp runtime and Android ABI', async () => {
    const info = await getNativeLlamaRuntimeInfo();
    expect(info.available).toBe(true);
    expect(info.abi).toBe('arm64-v8a');
  });

  it('forwards native token events and removes the listener', async () => {
    const remove = vi.fn();
    let receive: ((event: { token: string }) => void) | undefined;
    nativeMocks.addListener.mockImplementation(async (_name: string, listener: (event: { token: string }) => void) => {
      receive = listener;
      return { remove };
    });
    nativeMocks.generateStream.mockImplementation(async () => {
      receive?.({ token: 'Hello' });
      receive?.({ token: ' world' });
      return { text: 'Hello world', cancelled: false };
    });

    const tokens: string[] = [];
    const result = await streamNativeLlamaResponse(
      [{ role: 'user', content: 'Hi' }],
      64,
      token => tokens.push(token),
    );

    expect(tokens).toEqual(['Hello', ' world']);
    expect(result).toEqual({ text: 'Hello world', cancelled: false });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('calls native cancel when the AbortSignal fires', async () => {
    const controller = new AbortController();
    nativeMocks.generateStream.mockResolvedValue({ text: '', cancelled: true });
    const pending = streamNativeLlamaResponse(
      [{ role: 'user', content: 'Stop' }],
      64,
      () => undefined,
      controller.signal,
    );

    controller.abort();
    await expect(pending).resolves.toEqual({ text: '', cancelled: true });
    expect(nativeMocks.cancelGeneration).toHaveBeenCalledTimes(1);
  });

  it('rejects a signal that was already aborted before native inference', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(streamNativeLlamaResponse(
      [{ role: 'user', content: 'Do not run' }],
      64,
      () => undefined,
      controller.signal,
    )).rejects.toThrow(/cancelled/i);
    expect(nativeMocks.generateStream).not.toHaveBeenCalled();
  });
});
