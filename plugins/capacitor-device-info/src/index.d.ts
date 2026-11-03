export interface AFGDeviceInfoResult {
  deviceLabel: string;
  osLabel: string;
  architecture: string;
  cpuCores: number;
  memoryGiB: number;
  availableMemoryGiB: number;
  lowMemory: boolean;
  storageFreeBytes: number;
}
export interface AFGDeviceInfoPlugin {
  getInfo(): Promise<AFGDeviceInfoResult>;
}
export const AFGDeviceInfo: AFGDeviceInfoPlugin;