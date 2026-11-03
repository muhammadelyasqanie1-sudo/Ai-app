import { Capacitor } from '@capacitor/core';
import { AFGDeviceInfo } from '@afg-ai/capacitor-device-info';

export type OfflineDeviceProfile = {
  platform: 'android' | 'ios' | 'desktop' | 'unknown';
  browser: string;
  deviceLabel: string;
  osLabel: string;
  architecture: string;
  cpuCores: number | null;
  memoryGiB: number | null;
  availableMemoryGiB: number | null;
  lowMemory: boolean | null;
  storageFreeBytes: number | null;
  storageQuotaBytes: number | null;
  gpuAvailable: boolean;
  gpuName: string | null;
  gpuMaxBufferBytes: number | null;
  webGpuSupported: boolean;
  nativeInfoAvailable: boolean;
  notes: string[];
};

type NativeDeviceInfo = Partial<Pick<OfflineDeviceProfile,
  'deviceLabel' | 'osLabel' | 'architecture' | 'cpuCores' | 'memoryGiB' | 'availableMemoryGiB' | 'lowMemory' | 'storageFreeBytes'>>;

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/CriOS\//.test(ua)) return 'Chrome iOS';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown browser';
}

function architectureHint(ua: string): string {
  if (/arm64|aarch64/i.test(ua)) return 'ARM64 (estimated)';
  if (/arm/i.test(ua)) return 'ARM (estimated)';
  if (/x86_64|Win64|x64/i.test(ua)) return 'x86-64 (estimated)';
  return 'Unknown';
}

/** Uses only browser-exposed capability data. Values such as deviceMemory are coarse estimates. */
export async function scanOfflineDevice(): Promise<OfflineDeviceProfile> {
  const ua = navigator.userAgent || '';
  const platformText = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ua;
  const platform: OfflineDeviceProfile['platform'] = /android/i.test(ua) ? 'android'
    : /iphone|ipad|ipod/i.test(ua) ? 'ios'
    : /win|mac|linux/i.test(platformText) ? 'desktop' : 'unknown';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null;
  let storageFreeBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate();
    if (typeof estimate?.quota === 'number') storageQuotaBytes = estimate.quota;
    if (typeof estimate?.usage === 'number' && storageQuotaBytes !== null) storageFreeBytes = Math.max(0, storageQuotaBytes - estimate.usage);
  } catch { /* Storage estimates are optional and browser-controlled. */ }

  let gpuAvailable = false;
  let gpuName: string | null = null;
  let gpuMaxBufferBytes: number | null = null;
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<any> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (adapter) {
      gpuAvailable = true;
      gpuMaxBufferBytes = typeof adapter.limits?.maxBufferSize === 'number' ? adapter.limits.maxBufferSize : null;
      const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
      gpuName = info?.description || info?.device || info?.vendor || null;
    }
  } catch { /* A missing GPU adapter means WebGPU inference cannot start. */ }

  let native: NativeDeviceInfo = {};
  let nativeInfoAvailable = false;
  try {
    if (Capacitor.isNativePlatform()) {
      native = await AFGDeviceInfo.getInfo();
      nativeInfoAvailable = true;
    }
  } catch { /* Fall back to privacy-preserving browser estimates. */ }

  const osLabel = native.osLabel || (/Android ([\d.]+)/i.exec(ua)?.[0] || (/iPhone|iPad|iPod/.test(ua) ? 'iOS' : platformText || 'Unknown OS'));
  const deviceLabel = native.deviceLabel || (platform === 'android' ? 'Android device (model hidden by browser)' : platform === 'ios' ? 'Apple device' : platform === 'desktop' ? 'Desktop / laptop' : 'Unknown device');
  const notes = [
    !nativeInfoAvailable ? 'Exact device model, physical RAM and free disk space are not exposed to ordinary web pages; values shown are estimates.' : 'Native device details are available through the AFG device bridge.',
    !gpuAvailable ? 'WebGPU is unavailable in this browser context; local WebLLM inference cannot run here.' : 'WebGPU adapter detected; actual model support still depends on GPU memory and driver stability.',
    'No contacts, messages, photos, IMEI, precise location or personal files are accessed.'
  ];
  return {
    platform, browser: browserName(ua), deviceLabel, osLabel,
    architecture: native.architecture || architectureHint(ua),
    cpuCores: native.cpuCores || cores,
    memoryGiB: native.memoryGiB || (typeof memory === 'number' ? memory : null),
    availableMemoryGiB: native.availableMemoryGiB || null,
    lowMemory: typeof native.lowMemory === 'boolean' ? native.lowMemory : null,
    storageFreeBytes: native.storageFreeBytes ?? storageFreeBytes,
    storageQuotaBytes, gpuAvailable, gpuName, gpuMaxBufferBytes,
    webGpuSupported: gpuAvailable, nativeInfoAvailable, notes
  };
}

export type ModelFit = 'recommended' | 'limited' | 'incompatible';

export function assessOfflineModelFit(requiredGpuMB: number, device: OfflineDeviceProfile): ModelFit {
  if (!device.webGpuSupported) return 'incompatible';
  const requiredBytes = Math.max(0, requiredGpuMB) * 1024 * 1024;
  if (device.gpuMaxBufferBytes !== null && requiredBytes > device.gpuMaxBufferBytes) return 'incompatible';
  if (device.memoryGiB !== null && requiredGpuMB > 0) {
    // Browser memory reports are coarse; keep a large safety margin for the OS and browser.
    const conservativeBudgetMB = device.memoryGiB * 1024 * 0.35;
    if (requiredGpuMB > conservativeBudgetMB) return 'incompatible';
    if (requiredGpuMB > device.memoryGiB * 1024 * 0.2) return 'limited';
  }
  if (device.memoryGiB === null || device.storageFreeBytes === null) return 'limited';
  return 'recommended';
}
