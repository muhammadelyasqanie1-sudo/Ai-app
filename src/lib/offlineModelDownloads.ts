import { Capacitor } from '@capacitor/core';
import { AFGOfflineModels } from '@afg-ai/capacitor-offline-models';

export type OfflineDownloadState = {
  id: string;
  repoId: string;
  fileName: string;
  revision: string;
  url: string;
  expectedBytes: number | null;
  downloadedBytes: number;
  expectedSha256: string | null;
  computedSha256?: string | null;
  hashVerified?: boolean;
  localPath?: string | null;
  status: 'paused' | 'downloading' | 'installed' | 'error';
  updatedAt: number;
  error?: string;
};

export type OfflineDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
  status: OfflineDownloadState['status'];
};

type DownloadListener = (progress: OfflineDownloadProgress) => void;
type DownloadTask = { controller: AbortController; paused: boolean };

function isAndroidNative(): boolean { return Capacitor.getPlatform() === 'android'; }

function mapNativeDownload(item: Awaited<ReturnType<typeof AFGOfflineModels.getDownloadStatus>>): OfflineDownloadState {
  return {
    id: item.id, repoId: item.repoId, fileName: item.fileName, revision: item.revision,
    url: 'https://huggingface.co/' + item.repoId + '/resolve/' + item.revision + '/' + item.fileName,
    expectedBytes: item.expectedBytes, downloadedBytes: item.downloadedBytes, expectedSha256: item.expectedSha256,
    computedSha256: item.computedSha256, hashVerified: item.hashVerified, localPath: item.localPath, status: item.status,
    updatedAt: Date.now(), error: item.error,
  };
}

async function downloadGGUFAndroid(options: Parameters<typeof downloadGGUF>[0]): Promise<OfflineDownloadState> {
  const revision = options.revision || 'main';
  const url = 'https://huggingface.co/' + options.repoId + '/resolve/' + encodeURIComponent(revision) + '/' + options.fileName.split('/').map(encodeURIComponent).join('/');
  const existing = (await AFGOfflineModels.listDownloads()).downloads.find(item => item.id === options.repoId + '/' + options.fileName);
  let downloadId: number;
  if (existing && (existing.status === 'downloading' || existing.status === 'paused' || existing.status === 'installed')) {
    downloadId = existing.downloadId;
    if (existing.status === 'installed') return mapNativeDownload(existing);
  } else {
    if (existing) await AFGOfflineModels.deleteModel({ downloadId: existing.downloadId }).catch(() => undefined);
    const started = await AFGOfflineModels.startDownload({ url, repoId: options.repoId, revision, fileName: options.fileName, expectedBytes: options.expectedBytes, expectedSha256: options.expectedSha256 });
    downloadId = started.downloadId;
  }
  const abort = () => { void AFGOfflineModels.cancelDownload({ downloadId }); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (options.signal?.aborted) throw new Error('Android model download was cancelled.');
      const native = await AFGOfflineModels.getDownloadStatus({ downloadId });
      const state = mapNativeDownload(native);
      const totalBytes = state.expectedBytes;
      options.onProgress?.({ downloadedBytes: state.downloadedBytes, totalBytes, percent: totalBytes ? Math.min(100, Math.floor(state.downloadedBytes / totalBytes * 100)) : null, status: state.status });
      if (state.status === 'installed') return state;
      if (state.status === 'error') throw new Error(state.error || 'Android model download failed.');
      await new Promise(resolve => window.setTimeout(resolve, 1200));
    }
  } finally { options.signal?.removeEventListener('abort', abort); }
}

export const usesNativeOfflineDownloads = isAndroidNative;
const DB_NAME = 'afg-ai-offline-downloads';
const STORE = 'tasks';
const ROOT_DIR = 'afg-ai-models';
const activeTasks = new Map<string, DownloadTask>();

function storageRoot(): Promise<FileSystemDirectoryHandle> {
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (!storage.getDirectory) throw new Error('This browser does not support the Origin Private File System (OPFS).');
  return storage.getDirectory();
}

async function modelDirectory(): Promise<FileSystemDirectoryHandle> {
  return (await storageRoot()).getDirectoryHandle(ROOT_DIR, { create: true });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open offline model database.'));
  });
}

async function saveTask(task: OfflineDownloadState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(task);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to save download state.'));
  });
  db.close();
}

export async function listOfflineDownloads(): Promise<OfflineDownloadState[]> {
  if (isAndroidNative()) { const result = await AFGOfflineModels.listDownloads(); return result.downloads.map(mapNativeDownload).sort((a,b) => b.updatedAt - a.updatedAt); }
  const db = await openDb();
  const result = await new Promise<OfflineDownloadState[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineDownloadState[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getOfflineDownload(id: string): Promise<OfflineDownloadState | null> {
  if (isAndroidNative()) return (await listOfflineDownloads()).find(item => item.id === id) || null;
  const db = await openDb();
  const result = await new Promise<OfflineDownloadState | null>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as OfflineDownloadState) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function partName(id: string): string { return id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.part'; }
function finalName(id: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-140) || 'model.gguf';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_') + '--' + safe;
}

async function getFileSize(dir: FileSystemDirectoryHandle, name: string): Promise<number> {
  try { return (await (await dir.getFileHandle(name)).getFile()).size; } catch { return 0; }
}


/** Incremental SHA-256 so multi-gigabyte models are never loaded into one ArrayBuffer. */
export class Sha256 {
  private h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  private buffer = new Uint8Array(64);
  private buffered = 0;
  private bytes = 0;
  private k = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  update(data: Uint8Array): void {
    this.bytes += data.length;
    let offset = 0;
    while (offset < data.length) {
      const take = Math.min(64 - this.buffered, data.length - offset);
      this.buffer.set(data.subarray(offset, offset + take), this.buffered);
      this.buffered += take; offset += take;
      if (this.buffered === 64) { this.block(this.buffer); this.buffered = 0; }
    }
  }
  private block(chunk: Uint8Array): void {
    const w = new Uint32Array(64);
    const view = new DataView(chunk.buffer, chunk.byteOffset, 64);
    for (let i=0;i<16;i++) w[i]=view.getUint32(i*4);
    for (let i=16;i<64;i++) {
      const x=w[i-15], y=w[i-2];
      const s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3);
      const s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=Array.from(this.h);
    for(let i=0;i<64;i++){
      const s1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      const ch=(e&f)^(~e&g);
      const t1=(h+s1+ch+this.k[i]+w[i])>>>0;
      const s0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      const maj=(a&b)^(a&c)^(b&c);
      const t2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    const values=[a,b,c,d,e,f,g,h];
    for(let i=0;i<8;i++) this.h[i]=(this.h[i]+values[i])>>>0;
  }
  digest(): string {
    const bitLength=this.bytes*8;
    this.buffer[this.buffered++]=0x80;
    if(this.buffered>56){this.buffer.fill(0,this.buffered);this.block(this.buffer);this.buffered=0;}
    this.buffer.fill(0,this.buffered,56);
    const view=new DataView(this.buffer.buffer);
    view.setUint32(56,Math.floor(bitLength/0x100000000));
    view.setUint32(60,bitLength>>>0);
    this.block(this.buffer);
    return Array.from(this.h).map(v=>v.toString(16).padStart(8,'0')).join('');
  }
}

export async function downloadGGUF(options: {
  repoId: string;
  fileName: string;
  revision?: string;
  expectedBytes?: number | null;
  expectedSha256?: string | null;
  onProgress?: DownloadListener;
  signal?: AbortSignal;
}): Promise<OfflineDownloadState> {
  const { repoId, fileName } = options;
  const revision = options.revision || 'main';
  const id = repoId + '/' + fileName;
  if (activeTasks.has(id)) throw new Error('This model is already downloading.');
  if (isAndroidNative()) {
    activeTasks.set(id, { controller: new AbortController(), paused: false });
    try { return await downloadGGUFAndroid(options); }
    finally { activeTasks.delete(id); }
  }
  if (!/^[^/]+\/[^/]+$/.test(repoId) || !fileName.toLowerCase().endsWith('.gguf') || fileName.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid GGUF model selection.');
  const controller = new AbortController();
  const task: DownloadTask = { controller, paused: false };
  activeTasks.set(id, task);
  const relayAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', relayAbort, { once: true });
  const partial = partName(id);
  const target = finalName(id, fileName);
  const expectedBytes = options.expectedBytes && options.expectedBytes > 0 ? options.expectedBytes : null;
  const expectedSha256 = options.expectedSha256?.toLowerCase() || null;
  let activeWritable: FileSystemWritableFileStream | null = null;
  let dir: FileSystemDirectoryHandle | null = null;
  try {
    dir = await modelDirectory();
    const previousTask = await getOfflineDownload(id);
    if (previousTask && previousTask.revision !== revision) await dir.removeEntry(partial).catch(() => undefined);
    let offset = await getFileSize(dir, partial);
    const modelUrl = 'https://huggingface.co/' + repoId + '/resolve/' + encodeURIComponent(revision) + '/' + fileName.split('/').map(encodeURIComponent).join('/');
    await saveTask({ id, repoId, fileName, revision, url: modelUrl, expectedBytes, downloadedBytes: offset, expectedSha256, status: 'downloading', updatedAt: Date.now() });
    let response = await fetch(modelUrl, {
      headers: offset ? { Range: 'bytes=' + offset + '-' } : {},
      signal: controller.signal,
      redirect: 'follow',
    });
    if (offset && response.status === 200) {
      await dir.removeEntry(partial).catch(() => undefined);
      offset = 0;
    } else if (offset && response.status !== 206) {
      throw new Error('The model host did not support byte-range resume. Retry after clearing the partial download.');
    }
    if (!response.ok || !response.body) throw new Error('Model download failed (' + response.status + ').');
    const range = response.headers.get('content-range');
    const rangeMatch = range?.match(/^bytes (\d+)-\d+\/(\d+|\*)$/);
    if (offset && (!rangeMatch || Number(rangeMatch[1]) !== offset)) {
      throw new Error('The model host returned an invalid byte range; the partial download was preserved for retry.');
    }
    const totalFromRange = rangeMatch && rangeMatch[2] !== '*' ? Number(rangeMatch[2]) : null;
    const contentLength = Number(response.headers.get('content-length'));
    const totalBytes = Number.isFinite(totalFromRange) && totalFromRange! > 0
      ? totalFromRange
      : (expectedBytes || (Number.isFinite(contentLength) && contentLength > 0 ? offset + contentLength : null));
    const handle = await dir.getFileHandle(partial, { create: true });
    const reader = response.body.getReader();
    let downloadedBytes = offset;
    let lastPersistedBytes = offset;
    const sha = new Sha256();
    // Re-read a partial file before opening its writer so hashing sees committed bytes.
    if (offset) {
      const existing = await (await handle.getFile()).stream().getReader();
      while (true) { const item = await existing.read(); if (item.done) break; sha.update(item.value); }
    }
    const writable = await handle.createWritable({ keepExistingData: true });
    activeWritable = writable;
    await writable.seek(offset);
    const emit = (status: OfflineDownloadState['status']) => options.onProgress?.({
      downloadedBytes, totalBytes, percent: totalBytes ? Math.min(100, Math.floor(downloadedBytes / totalBytes * 100)) : null, status,
    });
    emit('downloading');
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      await writable.write(item.value);
      sha.update(item.value);
      downloadedBytes += item.value.length;
      if (downloadedBytes - lastPersistedBytes >= 8 * 1024 * 1024) {
        await saveTask({ id, repoId, fileName, revision, url: modelUrl, expectedBytes: totalBytes, downloadedBytes, expectedSha256, status: 'downloading', updatedAt: Date.now() });
        lastPersistedBytes = downloadedBytes;
      }
      emit('downloading');
    }
    await writable.close();
    activeWritable = null;
    if (totalBytes && downloadedBytes !== totalBytes) throw new Error('Downloaded file size does not match the expected size.');
    const digest = sha.digest();
    if (expectedSha256 && digest !== expectedSha256) {
      await dir.removeEntry(partial).catch(() => undefined);
      throw new Error('SHA-256 verification failed. The incomplete or corrupted file was deleted.');
    }
    const partHandle = await dir.getFileHandle(partial);
    const finalHandle = await dir.getFileHandle(target, { create: true });
    const finalWritable = await finalHandle.createWritable();
    try {
      const fileReader = (await partHandle.getFile()).stream().getReader();
      while (true) { const item = await fileReader.read(); if (item.done) break; await finalWritable.write(item.value); }
      await finalWritable.close();
    } catch (error) { await finalWritable.abort().catch(() => undefined); await dir.removeEntry(target).catch(() => undefined); throw error; }
    await dir.removeEntry(partial);
    const result: OfflineDownloadState = {
      id, repoId, fileName, revision, url: modelUrl,
      expectedBytes: downloadedBytes, downloadedBytes, expectedSha256, computedSha256: digest,
      hashVerified: Boolean(expectedSha256 && digest === expectedSha256), status: 'installed', updatedAt: Date.now(),
    };
    await saveTask(result);
    emit('installed');
    return result;
  } catch (error) {
    if (activeWritable) await activeWritable.close().catch(() => undefined);
    const paused = task.paused || controller.signal.aborted;
    const current = dir ? await getFileSize(dir, partial).catch(() => 0) : 0;
    const result: OfflineDownloadState = {
      id, repoId, fileName, revision, url: 'https://huggingface.co/' + repoId + '/resolve/' + encodeURIComponent(revision) + '/' + fileName,
      expectedBytes, downloadedBytes: current, expectedSha256, status: paused ? 'paused' : 'error',
      updatedAt: Date.now(), error: paused ? undefined : error instanceof Error ? error.message : String(error),
    };
    await saveTask(result);
    options.onProgress?.({ downloadedBytes: current, totalBytes: expectedBytes, percent: expectedBytes ? Math.floor(current / expectedBytes * 100) : null, status: result.status });
    if (!paused) throw error;
    return result;
  } finally {
    options.signal?.removeEventListener('abort', relayAbort);
    activeTasks.delete(id);
  }
}

export function pauseGGUFDownload(id: string): void {
  if (isAndroidNative()) return; // Android DownloadManager retries/resumes interrupted transfers in the background.
  const task = activeTasks.get(id);
  if (task) { task.paused = true; task.controller.abort('paused by user'); }
}

export async function removeOfflineModel(id: string): Promise<void> {
  if (isAndroidNative()) { const item = await getOfflineDownload(id); if (item) { const native = (await AFGOfflineModels.listDownloads()).downloads.find(entry => entry.id === id); if (native) await AFGOfflineModels.deleteModel({ downloadId: native.downloadId }); } return; }
  const dir = await modelDirectory();
  const task = await getOfflineDownload(id);
  if (!task) return;
  await dir.removeEntry(finalName(id, task.fileName), { recursive: false }).catch(() => undefined);
  await dir.removeEntry(partName(id), { recursive: false }).catch(() => undefined);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getInstalledModelFile(id: string): Promise<File | null> {
  if (isAndroidNative()) return null; // Native inference runtimes consume the private file path from the Android plugin.
  const task = await getOfflineDownload(id);
  if (!task || task.status !== 'installed') return null;
  const dir = await modelDirectory();
  try { return await (await dir.getFileHandle(finalName(id, task.fileName))).getFile(); } catch { return null; }
}
