export type OfflineErrorCode =
  | 'catalog_error'
  | 'download_error'
  | 'checksum_error'
  | 'model_load_error'
  | 'inference_error'
  | 'out_of_memory';

export type OfflineDiagnosticEntry = {
  id: string;
  code: OfflineErrorCode;
  at: number;
  platform: string;
  online: boolean;
  modelId: string | null;
  operationId: string | null;
  message: string;
};

const DB_NAME = 'afg-ai-offline-diagnostics';
const STORE = 'events';
const MAX_ENTRIES = 500;
const SAFE_MESSAGE: Record<OfflineErrorCode, string> = {
  catalog_error: 'Offline model catalog request failed.',
  download_error: 'Offline model download failed.',
  checksum_error: 'Offline model integrity verification failed.',
  model_load_error: 'Offline model could not be loaded.',
  inference_error: 'Offline model inference failed.',
  out_of_memory: 'The device ran out of memory during an offline operation.',
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('at', 'at');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Diagnostics database unavailable.'));
  });
}

function safeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'diag-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function platformName(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  return /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'web';
}

/** Records only a classified error and non-content metadata. Never pass prompts, messages, tokens or raw exceptions. */
export async function recordOfflineDiagnostic(input: {
  code: OfflineErrorCode;
  modelId?: string | null;
  operationId?: string | null;
}): Promise<OfflineDiagnosticEntry> {
  const entry: OfflineDiagnosticEntry = {
    id: safeId(),
    code: input.code,
    at: Date.now(),
    platform: platformName(),
    online: typeof navigator === 'undefined' ? false : navigator.onLine,
    modelId: input.modelId ? input.modelId.slice(0, 180) : null,
    operationId: input.operationId ? input.operationId.slice(0, 100) : null,
    message: SAFE_MESSAGE[input.code],
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(entry);
    const count = store.count();
    count.onsuccess = () => {
      const excess = count.result - MAX_ENTRIES;
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
    tx.onerror = () => reject(tx.error || new Error('Unable to persist offline diagnostic.'));
  });
  db.close();
  return entry;
}

export async function listOfflineDiagnostics(limit = 200): Promise<OfflineDiagnosticEntry[]> {
  const db = await openDb();
  const entries = await new Promise<OfflineDiagnosticEntry[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineDiagnosticEntry[]);
    request.onerror = () => reject(request.error || new Error('Unable to read offline diagnostics.'));
  });
  db.close();
  return entries.sort((a, b) => b.at - a.at).slice(0, Math.max(1, Math.min(500, limit)));
}

export async function clearOfflineDiagnostics(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to clear offline diagnostics.'));
  });
  db.close();
}

export async function exportOfflineDiagnosticReport(): Promise<Blob> {
  const entries = await listOfflineDiagnostics(500);
  const report = {
    schemaVersion: 1,
    product: 'AFG AI',
    exportedAt: new Date().toISOString(),
    privacy: { includesPrompts: false, includesChatContent: false, includesTokens: false, includesRawExceptions: false },
    entries,
  };
  return new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
}

export async function downloadOfflineDiagnosticReport(): Promise<void> {
  const blob = await exportOfflineDiagnosticReport();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'afg-ai-offline-diagnostics-' + new Date().toISOString().slice(0, 10) + '.json';
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
