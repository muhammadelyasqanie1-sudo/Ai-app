import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = readFileSync(new URL('../src/lib/offlineModelDownloads.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/lib/offlineLlamaRuntime.ts', import.meta.url), 'utf8');
const native = readFileSync(new URL('../plugins/capacitor-jarvis/android/src/main/java/com/afgai/jarvis/AFGJarvisPlugin.java', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../src/components/afg/AfgJarvisView.tsx', import.meta.url), 'utf8');
const gradle = readFileSync(new URL('../plugins/capacitor-jarvis/android/build.gradle', import.meta.url), 'utf8');

assert.match(catalog, /Qwen\/Qwen2\.5-0\.5B-Instruct-GGUF/);
assert.match(catalog, /qwen2\.5-0\.5b-instruct-q4_k_m\.gguf/);
assert.match(catalog, /74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db/);
assert.match(catalog, /https:\/\/huggingface\.co\//);
assert.match(catalog, /approximateSizeBytes: 514850816/);
assert.ok(catalog.includes('expectedSizeBytes: JARVIS_STARTER_MODEL.approximateSizeBytes'));
assert.match(runtime, /getLocalModelRuntimeInfo/);
assert.match(runtime, /loadLocalModel\(\{ path, contextSize, threads, expectedSha256 \}\)/);
assert.match(runtime, /offline !== true/);
assert.match(native, /url\.startsWith\("https:\/\/huggingface\.co\/"\)/);
assert.match(native, /expectedSha\.equals\(actualSha\)/);
assert.match(native, /expectedSha\.equals\(sha256\(model\)\)/);
assert.match(native, /getContext\(\)\.getFilesDir\(\), "jarvis-models"/);
assert.match(native, /new LlamaConfig\(contextSize, threads, 0/);
assert.match(native, /Llama\.INSTANCE\.complete/);
assert.match(native, /notifyListeners\("modelDownloadProgress"/);
assert.match(gradle, /dev\.ffmpegkit-maintained:llama-android:0\.1\.1/);
assert.match(screen, /Download offline model/);
assert.match(screen, /Understand command offline/);
assert.match(screen, /Review & confirm device action/);

console.log('JARVIS offline model: pinned Qwen GGUF, HTTPS allowlist, private storage, SHA-256-before-load, CPU-only llama.cpp and user-confirmed action handoff are present.');
