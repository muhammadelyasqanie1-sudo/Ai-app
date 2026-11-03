import { beforeEach, describe, expect, it } from 'vitest';
import { clearOfflineChatMessages, loadOfflineChatMessages, saveOfflineChatMessages } from '../src/lib/offlineChatStorage';
import { clearOfflineDiagnostics, listOfflineDiagnostics, recordOfflineDiagnostic } from '../src/lib/offlineDiagnostics';
import { clearOfflineMetrics, listOfflineMetrics, recordOfflineMetric } from '../src/lib/offlineMetrics';

describe('offline subsystem integration', () => {
  beforeEach(async () => {
    await clearOfflineChatMessages('integration-model');
    await clearOfflineDiagnostics();
    await clearOfflineMetrics();
  });

  it('stores chat, records a privacy-safe diagnostic and records lifecycle metrics', async () => {
    await saveOfflineChatMessages('integration-model', [{ role: 'user', content: 'Private prompt stays in chat storage' }]);
    await recordOfflineDiagnostic({ code: 'inference_error', modelId: 'org/model' });
    await recordOfflineMetric({ name: 'inference_started', modelId: 'org/model' });
    await recordOfflineMetric({ name: 'inference_completed', modelId: 'org/model', durationMs: 850 });

    expect((await loadOfflineChatMessages('integration-model'))[0]?.content).toContain('Private prompt');
    const diagnostics = await listOfflineDiagnostics();
    expect(diagnostics[0]?.code).toBe('inference_error');
    expect(JSON.stringify(diagnostics)).not.toContain('Private prompt');
    const metrics = await listOfflineMetrics();
    expect(metrics.map(metric => metric.name)).toEqual(expect.arrayContaining(['inference_started', 'inference_completed']));
    expect(JSON.stringify(metrics)).not.toContain('Private prompt');
  });
});
