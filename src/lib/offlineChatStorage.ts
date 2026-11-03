export type OfflineChatMessage = { role: 'user' | 'assistant'; content: string };
export type OfflineChatThread = { modelId: string; messages: OfflineChatMessage[]; updatedAt: number };

const DB_NAME = 'afg-ai-offline-chat';
const STORE_NAME = 'threads';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'modelId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open local chat history.'));
  });
}

export async function loadOfflineChatMessages(modelId: string): Promise<OfflineChatMessage[]> {
  if (!modelId) return [];
  const db = await openDb();
  const result = await new Promise<OfflineChatThread | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(modelId);
    request.onsuccess = () => resolve((request.result as OfflineChatThread) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result?.messages || [];
}

export async function saveOfflineChatMessages(modelId: string, messages: OfflineChatMessage[]): Promise<void> {
  if (!modelId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ modelId, messages, updatedAt: Date.now() } satisfies OfflineChatThread);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to save local chat history.'));
  });
  db.close();
}

export async function clearOfflineChatMessages(modelId: string): Promise<void> {
  if (!modelId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(modelId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to clear local chat history.'));
  });
  db.close();
}
