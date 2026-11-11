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

export async function unloadNativeLlamaModel(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') await AFGOfflineModels.unloadModel();
}

export async function pickAndImportNativeGgufModel(): Promise<{ path: string; fileName: string; sizeBytes: number }> {
  if (Capacitor.getPlatform() !== 'android') throw new Error('Selecting a local GGUF file is available in the Android app.');
  return AFGOfflineModels.pickAndImportModel();
}
