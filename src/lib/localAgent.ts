import { Capacitor } from '@capacitor/core';
import { listOfflineDownloads } from './offlineModelDownloads';
import { runExplicitDeviceCommand } from './localAgentDeviceTools';
import {
  generateNativeLlamaResponse,
  getNativeLlamaRuntimeInfo,
  loadNativeLlamaModel,
} from './offlineLlamaRuntime';

export type LocalAgentMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LocalAgentResult = {
  text: string;
  modelLabel: string;
  kind: 'local-model' | 'device-tool';
};

/**
 * Returns null when local inference is not available, allowing the caller to
 * use its existing online path. Only Android's native runtime and integrity-
 * verified GGUF downloads are eligible.
 */
export async function tryLocalFirstResponse(
  messages: LocalAgentMessage[],
  language: string,
): Promise<LocalAgentResult | null> {
  if (Capacitor.getPlatform() !== 'android') return null;

  const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user');
  if (latestUserMessage) {
    try {
      const deviceResult = await runExplicitDeviceCommand(latestUserMessage.content);
      if (deviceResult.handled) return { text: deviceResult.text, modelLabel: 'AFG AI Android device tools', kind: 'device-tool' };
    } catch (error) {
      // Never forward a failed explicit device action to a cloud model: that could
      // produce a misleading claim that the phone action succeeded.
      const detail = error instanceof Error ? error.message : 'Android rejected the requested action.';
      return { text: 'The phone action was not completed. ' + detail, modelLabel: 'AFG AI Android device tools', kind: 'device-tool' };
    }
  }

  const runtime = await getNativeLlamaRuntimeInfo();
  if (!runtime.available) return null;

  const downloads = await listOfflineDownloads();
  const installed = downloads.find((item) =>
    item.status === 'installed' &&
    item.hashVerified === true &&
    typeof item.localPath === 'string' &&
    item.localPath.length > 0 &&
    item.fileName.toLowerCase().endsWith('.gguf')
  );
  if (!installed?.localPath) return null;

  const safeHistory = messages
    .filter((item) => ['system', 'user', 'assistant'].includes(item.role))
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 6000),
    }));
  if (!safeHistory.some((item) => item.role === 'user')) return null;

  const languageInstruction = language === 'dari'
    ? 'پاسخ را به زبان دری بنویس، مگر این‌که کاربر زبان دیگری بخواهد.'
    : 'Reply in the same language as the latest user message.';
  safeHistory.unshift({
    role: 'system',
    content: 'You are AFG AI, a private on-device assistant. Work offline. Be honest about uncertainty and never claim to have performed device actions unless an authorized device tool confirms them. ' + languageInstruction,
  });

  // The native bridge validates that the path is inside AFG AI's private model directory.
  await loadNativeLlamaModel(installed.localPath, 2048, 4);
  const text = await generateNativeLlamaResponse(safeHistory, 256);
  if (!text.trim()) throw new Error('The local model returned an empty response.');

  return {
    text,
    modelLabel: installed.repoId + ' / ' + installed.fileName,
    kind: 'local-model',
  };
}
