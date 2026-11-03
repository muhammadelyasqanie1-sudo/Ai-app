export interface AFGDeviceInfoResult {
  deviceLabel: string;
  osLabel: string;
  architecture: string;
  cpuCores: number;
  memoryGiB: number;
  storageFreeBytes: number;
}
export interface AFGDeviceInfoPlugin {
  getInfo(): Promise<AFGDeviceInfoResult>;
}
export const AFGDeviceInfo: AFGDeviceInfoPlugin;