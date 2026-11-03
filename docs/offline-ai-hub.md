# Offline AI Hub

## Current implementation

- The hub uses the official WebLLM runtime and its prebuilt MLC model catalogue.
- Model weights are cached by WebLLM in IndexedDB. The app requests persistent browser storage where supported.
- Model download/loading progress is shown by the runtime callback. A Hugging Face repository-size estimate is shown when a model record exposes a Hugging Face URL and the public model API returns file sizes.
- Chat completions are executed in the browser through WebGPU; chat prompts are not sent to the AFG AI API.
- The service worker caches the same-origin app shell and static assets. API routes are deliberately excluded.

## Platform support

- Web: requires HTTPS (or localhost), a WebGPU-capable browser, enough GPU memory, and enough persistent storage.
- Android: the same UI/runtime can run inside the Capacitor WebView only when that Android System WebView exposes WebGPU and the device has enough GPU memory. WebGPU is not available in every Android WebView, especially older Android releases.
- This commit does not include a native Android C++/JNI inference plugin. A dedicated native llama.cpp or MLC Android runtime is a separate engineering task and is required to support devices without WebGPU.

## Model catalogue scope

The catalogue is the set of prebuilt models supported by WebLLM/MLC, not every arbitrary Hugging Face model. GGUF files and models in unsupported formats are not automatically executable. A model must be compiled for the selected runtime.

## Storage and deletion

WebLLM owns its model cache. The hub records which model IDs have loaded successfully and shows browser storage usage, but does not claim that forgetting a model deletes its cached tensor files. Browser/OS storage eviction or clearing site data can remove cached weights.

## Validation

No build, test, or deployment was run as part of this change. The branch must be installed and validated on a WebGPU desktop browser and a real Android WebView device before release.
