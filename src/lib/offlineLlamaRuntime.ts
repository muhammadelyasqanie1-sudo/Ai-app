import { Capacitor } from '@capacitor/core';
import { AFGOfflineModels } from '@afg-ai/capacitor-offline-models';

export type NativeLlamaRuntimeInfo = {
  available: boolean;
  engine: string;
  abi: string;
  backend: string;
  reason?: string;
};

export async function getNativeLlamaRuntimeInfo(): Promise<NativeLlamaRuntimeInfo> {
  if (Capacitor.getPlatform() !== 'android') {
    return { available: false, engine: 'unavailable', abi: 'web', backend: 'none', reason: 'Native llama.cpp is Android-only.' };
  }
  return AFGOfflineModels.getRuntimeInfo();
}

export async function loadNativeLlamaModel(path: string, contextSize = 2048, threads = 4): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') throw new Error('Native llama.cpp is only available in the Android app.');
  await AFGOfflineModels.loadModel({ path, contextSize, threads });
}

export async function generateNativeLlamaResponse(messages: Array<{ role: string; content: string }>, maxTokens = 256): Promise<string> {
  const result = await AFGOfflineModels.generate({ messages: JSON.stringify(messages), maxTokens });
  return result.text;
}

export async function streamNativeLlamaResponse(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 256,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; cancelled: boolean }> {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('Native llama.cpp streaming is only available in the Android app.');
  }
  if (signal?.aborted) throw new DOMException('Generation was cancelled.', 'AbortError');
  const listener = await AFGOfflineModels.addListener('generationToken', event => onToken(event.token));
  const abort = () => { void AFGOfflineModels.cancelGeneration(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const result = await AFGOfflineModels.generateStream({
      messages: JSON.stringify(messages),
      maxTokens,
    });
    return result;
  } finally {
    signal?.removeEventListener('abort', abort);
    await listener.remove();
  }
}

export async function cancelNativeLlamaGeneration(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') await AFGOfflineModels.cancelGeneration();
}

export async function unloadNativeLlamaModel(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') await AFGOfflineModels.unloadModel();
}
