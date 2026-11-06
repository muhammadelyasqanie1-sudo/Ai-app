export interface NativeOfflineDownload {
  id: string;
  downloadId: number;
  repoId: string;
  revision: string;
  fileName: string;
  status: 'downloading' | 'paused' | 'installed' | 'error';
  downloadedBytes: number;
  expectedBytes: number | null;
  expectedSha256: string | null;
  computedSha256: string | null;
  hashVerified: boolean;
  localPath: string | null;
  error?: string;
}
export interface StartNativeDownloadOptions {
  url: string;
  repoId: string;
  revision: string;
  fileName: string;
  expectedBytes?: number | null;
  expectedSha256?: string | null;
}
export interface AFGOfflineModelsPlugin {
  startDownload(options: StartNativeDownloadOptions): Promise<{ downloadId: number; id: string }>;
  getDownloadStatus(options: { downloadId: number }): Promise<NativeOfflineDownload>;
  listDownloads(): Promise<{ downloads: NativeOfflineDownload[] }>;
  cancelDownload(options: { downloadId: number }): Promise<{ removed: boolean }>;
  deleteModel(options: { downloadId: number }): Promise<{ deleted: boolean }>;
  getRuntimeInfo(): Promise<{ available: boolean; engine: string; abi: string; backend: string; reason?: string }>;
  getNeedleRuntimeInfo(): Promise<{ available: boolean; engine: string; abi: string; backend: string; modelFormat: string; modelSha256: string; modelLoaded: boolean; modelReady: boolean; reason?: string }>;
  loadNeedleModel(options: { path: string; systemPrompt: string; toolsJson: string }): Promise<{ loaded: boolean; engine: string; path: string; sizeBytes: number; sha256Verified: boolean }>;
  completeNeedle(options: { input: string; maxTokens?: number }): Promise<{ text: string }>;
  resetNeedle(): Promise<{ reset: boolean; modelMemoryReleased: boolean }>;
  loadModel(options: { path: string; contextSize?: number; threads?: number }): Promise<{ loaded: boolean; path: string; sizeBytes: number }>;
  generate(options: { messages: string; maxTokens?: number }): Promise<{ text: string }>;
  unloadModel(): Promise<{ unloaded: boolean }>;
}
export const AFGOfflineModels: AFGOfflineModelsPlugin;
