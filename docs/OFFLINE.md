# AFG AI Offline Learning — implementation status

## Current status: unavailable / disabled

Offline Learning is not implemented yet. There is no Ollama adapter, WebLLM/WASM runtime, PWA offline model store, signed pack catalog, Ed25519 verifier, model hash installer, lesson/quiz pack, local progress database or consent-based sync UI in this repository.

The environment variables in `.env.example` are placeholders only. In particular, `PACK_SIGNING_PUBKEY` and `PACK_MIRROR_URL` must not be treated as a functioning pack trust system. `OLLAMA_BASE_URL` is a future local-daemon setting and the server does not proxy to it.

## Safety contract

Do not advertise Offline Learning as available and do not silently send offline requests to a cloud provider. Until the complete local runtime and signed-pack verification path exist, users must be told the feature is unavailable. No pack should be installed or loaded without a verified Ed25519 signature and SHA-256 model digest.

The eventual tutor must be education-only, refuse medical/legal/financial/safety-critical and other out-of-scope requests with the exact guardrail text in the product specification, and keep progress local unless the user explicitly opts into sync.

## Required future work

1. Choose and implement a local browser runtime (WebLLM/WebGPU or llama.cpp WASM) and a desktop-only localhost Ollama bridge.
2. Define a signed pack manifest schema and trusted Ed25519 public key rotation process.
3. Implement resumable download, signature and SHA-256 verification before installation.
4. Ship at least one licensed English lessons pack and run the fixed post-install health prompt.
5. Implement the offline-only tutor guardrail, citations, language coverage and explicit online-consent boundary.
6. Add local lesson progress, quiz attempts, flashcards, uninstall cleanup and opt-in export/sync.
7. Verify behavior with network disabled in a dedicated test environment when explicitly authorized.
