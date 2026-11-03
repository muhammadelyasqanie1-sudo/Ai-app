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
}
export const AFGOfflineModels: AFGOfflineModelsPlugin;
