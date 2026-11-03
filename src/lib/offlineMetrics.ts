export type OfflineMetricName =
  | 'download_started'
  | 'download_completed'
  | 'download_failed'
  | 'checksum_failed'
  | 'inference_started'
  | 'inference_completed'
  | 'inference_failed'
  | 'out_of_memory';

export type OfflineMetric = {
  id: string;
  name: OfflineMetricName;
  at: number;
  durationMs: number | null;
  bytes: number | null;
  modelId: string | null;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  online: boolean;
};

const DB_NAME = 'afg-ai-offline-metrics';
const STORE = 'metrics';
const MAX_METRICS = 2000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('at', 'at');
        store.createIndex('name', 'name');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline metrics database unavailable.'));
  });
}

function platform(): OfflineMetric['platform'] {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  return /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'web';
}

/** Metrics deliberately exclude prompts, chat messages, generated tokens, URLs and raw errors. */
export async function recordOfflineMetric(input: {
  name: OfflineMetricName;
  durationMs?: number | null;
  bytes?: number | null;
  modelId?: string | null;
}): Promise<void> {
  const metric: OfflineMetric = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'metric-' + Date.now() + '-' + Math.random(),
    name: input.name,
    at: Date.now(),
    durationMs: Number.isFinite(input.durationMs) && input.durationMs! >= 0 ? Math.round(input.durationMs!) : null,
    bytes: Number.isFinite(input.bytes) && input.bytes! >= 0 ? Math.round(input.bytes!) : null,
    modelId: input.modelId ? input.modelId.slice(0, 180) : null,
    platform: platform(),
    online: typeof navigator === 'undefined' ? false : navigator.onLine,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(metric);
    const count = store.count();
    count.onsuccess = () => {
      const excess = count.result - MAX_METRICS;
      if (excess > 0) {
        const cursorRequest = store.index('at').openCursor();
        let removed = 0;
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || removed >= excess) return;
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to persist offline metric.'));
  });
  db.close();
}

export async function listOfflineMetrics(limit = 1000): Promise<OfflineMetric[]> {
  const db = await openDb();
  const entries = await new Promise<OfflineMetric[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineMetric[]);
    request.onerror = () => reject(request.error || new Error('Unable to read offline metrics.'));
  });
  db.close();
  return entries.sort((a, b) => b.at - a.at).slice(0, Math.max(1, Math.min(MAX_METRICS, limit)));
}

export async function exportOfflineMetrics(): Promise<Blob> {
  const metrics = await listOfflineMetrics(MAX_METRICS);
  return new Blob([JSON.stringify({
    schemaVersion: 1,
    product: 'AFG AI',
    exportedAt: new Date().toISOString(),
    privacy: { includesPrompts: false, includesChatContent: false, includesGeneratedTokens: false },
    metrics,
  }, null, 2)], { type: 'application/json' });
}

export async function clearOfflineMetrics(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to clear offline metrics.'));
  });
  db.close();
}
