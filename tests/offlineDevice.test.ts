import { describe, expect, it } from 'vitest';
import { assessOfflineModelFit, type OfflineDeviceProfile } from '../src/lib/offlineDevice';

const device: OfflineDeviceProfile = {
  platform: 'android',
  browser: 'Chrome',
  deviceLabel: 'Test Android',
  osLabel: 'Android',
  architecture: 'ARM64',
  cpuCores: 8,
  memoryGiB: 8,
  availableMemoryGiB: 4,
  lowMemory: false,
  storageFreeBytes: 8 * 1024 ** 3,
  storageQuotaBytes: 10 * 1024 ** 3,
  gpuAvailable: true,
  gpuName: 'Test GPU',
  gpuMaxBufferBytes: 4 * 1024 ** 3,
  webGpuSupported: true,
  nativeInfoAvailable: true,
  notes: [],
};

describe('offline device model fit', () => {
  it('rejects WebGPU models when WebGPU is unavailable', () => {
    expect(assessOfflineModelFit(1000, { ...device, webGpuSupported: false })).toBe('incompatible');
  });
  it('rejects models exceeding the adapter buffer limit', () => {
    expect(assessOfflineModelFit(5000, device)).toBe('incompatible');
  });
  it('returns a conservative fit for a small supported model', () => {
    expect(assessOfflineModelFit(256, device)).toBe('recommended');
  });
});
