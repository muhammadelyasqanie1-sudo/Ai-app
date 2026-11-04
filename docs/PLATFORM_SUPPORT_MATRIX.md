# AFG AI Platform Support Matrix

Last reviewed: 2026-11-03

This document records what the repository actually contains. Source presence is not treated as proof of a working platform. CI evidence is tied to the exact pull-request head noted below and is not a claim that the same commit is deployed to production.

## Platform matrix

| Target | Current status | Evidence and limitations |
|---|---|---|
| Web | PARTIALLY IMPLEMENTED | React/Vite app, Express API boundary, web manifest, service worker app-shell caching, OPFS/IndexedDB offline storage, and WebLLM prebuilt-model path exist. Offline cloud chat is not available without a network/backend. Browser GGUF files can be stored, but browser GGUF inference is not implemented. PWA installation and offline recovery have not been manually verified in browsers. |
| Android | PARTIALLY IMPLEMENTED | Capacitor Android packaging and an Android-only native plugin exist. The plugin uses Android DownloadManager and an arm64-v8a llama.cpp JNI CPU backend. Android debug APK build passed on PR #9 head `7c75eecf4bbcb13cbeacd38860b7f11bc8683431` (GitHub Actions run 41622435477); artifact `afg-ai-offline-hub-debug-apk` was uploaded. Physical install, model load, long-running inference, thermal behavior, and background download recovery have not been device-tested in this mission. |
| iOS | NOT IMPLEMENTED | The current package dependencies and native offline plugin do not include a complete iOS target/runtime. No iOS build or App Store compliance validation exists. |
| Windows | NOT IMPLEMENTED | No Windows desktop shell, installer, native terminal, or local inference packaging has been verified. |
| macOS | NOT IMPLEMENTED | No macOS desktop shell, installer, Metal runtime, or Apple Silicon build has been verified. |
| Linux | NOT IMPLEMENTED | No AppImage/DEB/RPM package or native Linux inference backend has been verified. |

## AI and backend capabilities

| Area | Current status | Evidence and limitations |
|---|---|---|
| Cloud providers | PARTIALLY IMPLEMENTED | The provider registry currently includes Cloudflare Workers AI and a server-configured OpenAI-compatible adapter. Custom arbitrary provider creation with encrypted DB-stored credentials and per-provider adapters is not complete. |
| Model discovery | PARTIALLY IMPLEMENTED | Provider model discovery and Hugging Face GGUF metadata discovery exist. Model registry formats and capabilities are not universal; many Hugging Face models are discoverable but not directly runnable. |
| Model routing | IMPLEMENTED BUT NOT VERIFIED | PR #6 pins manually selected models and limits Auto-mode failover to administrator-configured fallback IDs. TypeScript, offline SHA tests, locale checks and production build passed on PR #6 head `49758e23c4bcae1d0f966de772e79d6128645967`. Live provider/database failover was not tested. |
| Offline inference | PARTIALLY IMPLEMENTED | WebLLM prebuilt models require browser WebGPU. Android GGUF inference uses a native arm64 llama.cpp CPU library when present. Browser GGUF inference, iOS inference, desktop runtimes, streaming/cancellation parity, and full sampling controls are incomplete. |
| Download manager | PARTIALLY IMPLEMENTED | Android DownloadManager and browser OPFS downloads exist with SHA-256 calculation and trusted-hash comparison when supplied. Android pause/resume controls and universal checksum availability are not guaranteed. |
| AI Terminal | PARTIALLY IMPLEMENTED | Authenticated, owner-scoped sessions, CLI token lifecycle and audit history exist. Only read-only `afg` commands are enabled. Arbitrary shell execution is intentionally disabled until a real isolated sandbox is deployed. |
| Admin control center | PARTIALLY IMPLEMENTED | Backend admin endpoints enforce granular permissions from `roles.permissions_json`; root admins manage staff permission maps and assign registered staff roles. Account status changes are permission-gated. Staff invitations, activation/deactivation workflows, support notes, and fully permission-filtered staff navigation remain incomplete. Migration 0008 is committed but not applied. |
| Files and documents | PARTIALLY IMPLEMENTED | User-owned file metadata and storage-related APIs exist; complete cross-platform file lifecycle and document-processing coverage are not verified. |

## Database and deployment

| Area | Current status | Evidence and limitations |
|---|---|---|
| PostgreSQL integration | IMPLEMENTED BUT NOT VERIFIED | Server uses `DATABASE_URL` with `pg`. Supabase PostgreSQL TLS is now enabled by default for `.supabase.co` and `.supabase.com` hosts when `DATABASE_SSL` is unset. Regression tests for TLS policy passed in PR #10 CI. |
| Supabase live connection | BLOCKED BY EXTERNAL REQUIREMENT | No database credential/connection was supplied to this editing session. The `SUCCESS SUPABASE_DATABASE_CONNECTED` log is emitted only after a real successful `SELECT 1`, but that live path was not exercised here. |
| Database migrations | PARTIALLY IMPLEMENTED | Migration files 0000–0007 and a migration runner exist. No migration was run during this mission. Production schema state is not inferred from repository files. |
| Render deployment | BLOCKED BY EXTERNAL REQUIREMENT | No Render deployment was triggered or verified in this mission. |
| Provider credentials | BLOCKED BY EXTERNAL REQUIREMENT | Provider keys must be configured as server-side environment variables. No credentials were created, exposed, or invented. |

## Localization and accessibility

| Area | Current status | Evidence and limitations |
|---|---|---|
| Dari | IMPLEMENTED BUT NOT VERIFIED | Primary UI dictionary and RTL handling exist; locale CI passes. |
| English | IMPLEMENTED BUT NOT VERIFIED | UI dictionary and LTR handling exist; locale CI passes. |
| Pashto | NOT IMPLEMENTED | The current language type and dictionaries expose Dari and English only. |
| Arabic | NOT IMPLEMENTED | Arabic dictionary and RTL locale support are not complete. |
| Accessibility | PARTIALLY IMPLEMENTED | Some controls include accessible labels/focus handling and reduced-motion styles exist; no full accessibility audit was run. |

## Verified CI evidence during this mission

- PR #6: TypeScript validation, offline SHA-256 regression tests, locale validation, and production web build passed.
- PR #7: TypeScript validation, offline SHA-256 regression tests, locale validation, and production web build passed.
- PR #8: TypeScript validation, offline SHA-256 regression tests, locale validation, and production web build passed for its original PR head. The build emitted the Offline Hub as a 72.11 kB chunk, but the shared `lib` chunk remained 6,116.37 kB (2,189.96 kB gzip); initial vendor payload reduction is not proven.
- PR #9: TypeScript validation, offline SHA-256 regression tests, locale validation, production web build, and Android debug APK build passed.
- PR #10: TypeScript validation, database TLS regression tests, offline SHA-256 regression tests, locale validation, and production web build passed.

All listed PRs remain separate review items unless their state is updated later. Passing CI does not mean a PR has been merged or deployed.
