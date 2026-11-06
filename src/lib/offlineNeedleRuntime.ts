import { Capacitor } from '@capacitor/core';
import { AFGOfflineModels } from '@afg-ai/capacitor-offline-models';

export const NEEDLE3_MODEL_ID = 'Cactus-Compute/needle3/needle3.cact';
export const NEEDLE3_MODEL_SHA256 = 'c9d915eca282ed42d1a09b143b592adb4cc6744ffe2d294adf5cfc5548170c38';

export type NativeNeedleRuntimeInfo = {
  available: boolean;
  engine: string;
  abi: string;
  backend: string;
  modelFormat: string;
  modelSha256: string;
  modelLoaded: boolean;
  modelReady: boolean;
  reason?: string;
};

function requireAndroid(): void {
  if (Capacitor.getPlatform() !== 'android') throw new Error('Cactus Needle 3 is available only in the Android APK.');
}

export async function getNativeNeedleRuntimeInfo(): Promise<NativeNeedleRuntimeInfo> {
  if (Capacitor.getPlatform() !== 'android') {
    return { available: false, engine: 'unavailable', abi: 'web', backend: 'none', modelFormat: '.cact', modelSha256: NEEDLE3_MODEL_SHA256, modelLoaded: false, modelReady: false, reason: 'Cactus Needle 3 is Android-only.' };
  }
  return AFGOfflineModels.getNeedleRuntimeInfo();
}

export async function loadNativeNeedleModel(path: string, systemPrompt: string, toolsJson: string): Promise<void> {
  requireAndroid();
  if (!path || !path.endsWith('needle3.cact')) throw new Error('Select the official Needle 3 model file.');
  await AFGOfflineModels.loadNeedleModel({ path, systemPrompt, toolsJson });
}

export async function generateNativeNeedleResponse(input: string, maxTokens = 128): Promise<string> {
  requireAndroid();
  const result = await AFGOfflineModels.completeNeedle({ input, maxTokens });
  return result.text;
}

export async function resetNativeNeedleModel(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') await AFGOfflineModels.resetNeedle();
}
