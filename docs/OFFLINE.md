# AFG AI Offline Runtime — implementation status

## Current status: Android GGUF inference foundation connected to chat; offline learning tutor remains disabled

The native Android chat path now attempts verified local GGUF inference before the existing cloud chat route. See [Local Agent](./LOCAL_AGENT.md) for the default behavior and limitations.

The repository now contains reusable foundations under `packages/offline`:

- Strict pack manifest schema for subjects, languages, runtime, model license, quantization, minimum RAM, size, SHA-256 and lesson hashes.
- Node-side Ed25519 signature + model SHA-256 verifier (`verifyPackBundle`).
- Browser WebCrypto Ed25519 + SHA-256 verifier (`verifyBrowserPack`); requires a browser with Ed25519 WebCrypto support and a raw 32-byte public key encoded as base64.
- IndexedDB local store for verified model blobs, lessons, lesson progress and export/uninstall operations. The installer rechecks model and lesson hashes before storing.
- Conservative education-only first-pass request policy with the required general-scope refusal and a separate high-stakes refusal.

These modules are not yet connected to a pack catalog, downloader, model runtime or tutor screen. Do not present Offline Learning as an available AI tutor.

## Trust and installation contract

The signature covers the exact raw bytes of `manifest.json`. The signed manifest includes the model SHA-256, exact model byte size, publisher, license, minimum RAM, runtime compatibility, declared languages, subjects and lesson file hashes. The browser installer verifies signature and model digest before writing local records, and verifies each lesson digest before saving.

The server-side verifier currently accepts an Ed25519 PEM public key. The browser verifier currently accepts the raw 32-byte Ed25519 public key encoded as base64. A production key provisioning/rotation policy, pack publisher onboarding, signed catalog API, download mirror and resumable download implementation are still missing.

## Local storage

IndexedDB database: `afg-ai-offline-learning`. Stores: packs, lessons_local, lesson_progress, quiz_attempts and offline_sessions. The storage module keeps data local and provides pack uninstall with optional progress deletion and JSON export. It is not yet wired to the app UI, OPFS, quota preflight, model loader or a runtime health check.

## Educational guardrails

The current `evaluateOfflineEducationRequest` is a conservative keyword-based pre-filter, not a semantic safety classifier. It must not be treated as sufficient on its own. Before enabling any model, combine it with pack-specific system instructions, output checks, citation validation and human review. The model must not answer medical, legal, financial or safety-critical requests. General out-of-scope questions must receive exactly:

> I'm your offline study tutor. I can help with English, science, math, and school subjects. Please switch to online AFG AI for general questions.

The separate high-stakes refusal is documented in `educationPolicy.ts`.

## Database and sync

Migration `0007_offline_pack_registry.sql` adds pack registry/version metadata and opt-in sync consent, usage and progress tables. Sync is not implemented: no API writes to these tables, and local progress is not uploaded. Consent defaults to false.

## Environment

`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_PULL_ON_INSTALL`, `PACK_SIGNING_PUBKEY`, `PACK_MIRROR_URL` and `OFFLINE_SYNC_DEFAULT` are reserved configuration only. The application does not proxy Ollama and does not download model packs.

## Remaining work before release

1. Implement an actual signed catalog API, publisher approval and key rotation/revocation.
2. Implement resumable downloads with exact progress and disk quota checks; verify signature before install and hashes before load.
3. Ship a licensed English learning pack and validate its references, quiz content and model license.
4. Complete runtime health checks, model compatibility validation, memory preflight and strict network-isolation verification for Android llama.cpp inference.
5. Implement a desktop app and localhost-only Ollama bridge; do not point cloud servers at localhost.
6. Add offline tutor chat, lesson browser, quiz, flashcards, progress dashboard, pack manager and uninstall confirmation.
7. Implement exact out-of-scope refusal, high-stakes refusal, answer language enforcement and lesson citation validation around the runtime.
8. Implement per-user consent UX, revocation, export and server sync APIs. No phone-home behavior before consent.
9. Verify with network disabled in a dedicated test environment only when explicitly authorized.
