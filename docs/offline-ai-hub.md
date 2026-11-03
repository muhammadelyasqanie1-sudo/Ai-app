# Offline AI Hub

## What is implemented on this branch

- A dedicated Offline AI Hub entry in AFG AI navigation.
- WebLLM's prebuilt MLC-compatible catalogue and local WebGPU chat. Prompts are processed by the browser runtime and are not sent to the AFG AI chat API.
- First-run model download/loading progress and an estimated repository size when Hugging Face metadata exposes file sizes.
- IndexedDB-backed model cache managed by WebLLM; the app requests persistent browser storage where supported.
- App-shell service worker and PWA manifest for reopening the cached application shell offline. API requests are never cached.
- Device capability scan:
  - Web: platform/browser hints, approximate CPU core count, coarse device-memory estimate where supported, WebGPU adapter/limits, and browser storage quota estimate.
  - Android Capacitor: a local native plugin reads manufacturer/model, Android release/API level, supported CPU ABIs, processor count, total RAM, and available bytes on the app's storage volume.
  - No contacts, SMS, photos, IMEI, precise location, or personal files are accessed.
- Model fit labels use conservative heuristics and distinguish recommended, limited, and incompatible. Browser-reported memory is approximate and is not a hardware guarantee.
- A pre-download storage check blocks downloads when known repository-size estimates exceed the estimated available browser storage.

## Platform and runtime limitations

- Web inference requires HTTPS (or localhost), WebGPU, a compatible browser/GPU driver, and enough GPU memory and storage.
- The Android native bridge improves hardware identification only. It does **not** yet provide a native inference engine.
- Android inference currently still depends on WebGPU inside Android System WebView. Android 10 and older WebViews commonly lack WebGPU; on those devices the hub must show an unsupported status rather than pretend the model can run.
- To support older Android devices, a separate native llama.cpp or MLC runtime is still required, including JNI/C++ integration, GGUF/MLC model handling, background downloads, cancellation/resume, checksum verification, storage management, and device-specific benchmarking. That native inference engine is not included in this branch.
- Web pages cannot reliably read exact physical RAM, dedicated GPU VRAM, exact device model, or the phone's true free disk space. Browser values are estimates and are labelled as such.
- The catalog is limited to models pre-converted for WebLLM/MLC. It is not an index of every Hugging Face model and does not mean arbitrary GGUF files can execute.
- Model repository sizes are estimates, not guaranteed exact download totals. The runtime controls the actual artifact set.
- WebLLM owns its IndexedDB model cache. A local list records models loaded successfully before; it cannot prove that browser/OS storage eviction has not removed the underlying cache. Clearing site data can remove model weights.

## Android native device plugin

The local Capacitor plugin lives in `plugins/capacitor-device-info`. It uses Android public APIs only and requires no dangerous permissions. The CI Android workflow generates the Capacitor project and runs `npx cap sync android`, which discovers the local plugin dependency.

## Release validation still required

No build, test, or deployment has been run. Before publishing:
1. Build the Android APK with the manual workflow and confirm the plugin is registered.
2. Verify native device details on physical Android devices, including Android 10.
3. Verify WebGPU inference separately on supported Android WebViews and desktop browsers.
4. Test model downloads over interrupted/slow networks, low-storage conditions, app restarts, and offline relaunch.
5. Confirm that the UI labels browser estimates and unsupported hardware accurately.
