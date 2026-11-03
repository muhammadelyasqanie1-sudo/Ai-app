# AFG AI — 12-hour engineering mission: baseline audit

**Audit date:** 2026-11-03  
**Repository:** `muhammadelyasqanie1-sudo/Ai-app`  
**Audited ref:** `main`  
**Baseline commit:** `95cd2ef41ac89f6463247488dec1d7dcd6f0b83b`

## 1. Audit scope and evidence

Inspected the complete recursive Git tree (254 entries; GitHub reports the tree is not truncated), repository metadata, root configuration, package scripts/dependencies, server entry point, API router, authentication/database/provider services, provider adapters, Offline Hub/runtime/device/download modules, Android Capacitor plugins, admin and terminal entry points, database migration inventory, and the existing architecture, gap, delivery, security, reliability, platform and acceptance documents.

This is a source-level audit only. The GitHub connector does not expose a local working-tree status, so uncommitted changes in a developer's local clone cannot be determined from this inspection. No files were overwritten or deleted.

## 2. Existing architecture

- **Web client:** React 19 + TypeScript + Vite, Tailwind CSS, Motion; main app under `src/`.
- **API/server:** Express in `server.ts`; shared API router in `src/api/http.ts`; Vite middleware for development.
- **AI gateway:** `src/services/providerGateway.ts`; currently registers Cloudflare Workers AI and one configurable OpenAI-compatible adapter.
- **Persistence:** PostgreSQL through `pg` and server-only `DATABASE_URL` in `src/api/database.ts`; migrations are in `database/migrations/` and run via `scripts/migrate.ts`.
- **Authentication:** custom server-side auth/session implementation in `src/api/auth.ts`; Google OAuth is optional and credential-dependent.
- **Android:** Capacitor 8 wrapper, app ID `com.afgai.app`, plus custom device-info and offline-model native plugins.
- **Offline inference:** browser WebLLM dependency and browser storage/download code; Android native llama.cpp JNI bridge and Android DownloadManager integration are present in source.
- **Shared packages:** `packages/shared`, `packages/providers`, `packages/i18n`, `packages/offline`, `packages/ui`; current package.json does not declare a multi-package workspace.
- **Desktop/iOS:** no complete native desktop packaging or iOS project was found in the audited tree.

## 3. Key findings and blockers

### Database and Supabase

**PARTIALLY IMPLEMENTED.** The application uses a direct PostgreSQL connection via `DATABASE_URL` and the Node `pg` pool. No Supabase JS client or Supabase-specific integration file was found. Supabase can provide the PostgreSQL database, but its project URL and API key are not interchangeable with the PostgreSQL connection string. A real connection is only confirmed by `checkDatabase()` executing `SELECT 1`; environment-variable presence alone is not proof.

The repository contains eight ordered migration files (`0000` through `0007`). Migrations are not run during this mission without separate approval. Production migration state and live connectivity are unknown.

### Providers and model routing

**PARTIALLY IMPLEMENTED.** Cloudflare Workers AI and an OpenAI-compatible adapter have server-side discovery/health/capability contracts. The provider gateway performs model availability checks and fallback logic. The current adapter registry is static and does not yet provide a complete administrator-managed arbitrary-provider adapter lifecycle. Provider keys are server-side environment variables in the current design.

The initial audit found an implicit Gemini-specific fallback in the OpenAI-compatible adapter. This was removed during the live execution milestone: the adapter now requires explicit `OPENAI_COMPAT_BASE_URL` and `OPENAI_COMPAT_API_KEY` configuration and no longer infers a Gemini endpoint or credential. Cloudflare and deliberately configured compatible providers remain the intended route.

### Offline AI Hub

**PARTIALLY IMPLEMENTED.** Hugging Face GGUF discovery, device capability estimates, browser OPFS/IndexedDB download support, Android DownloadManager support, SHA-256 verification metadata, Android device information, and an Android llama.cpp JNI bridge exist in source. Browser WebLLM is also included. This is not yet a universal local runtime: actual support is platform/runtime/model-format-specific. Download pause/resume/recovery and native runtime behavior require runtime verification; no Android build or physical-device execution was performed.

### Terminal

**PARTIALLY IMPLEMENTED / SAFELY RESTRICTED.** The server terminal API exposes a small read-only `afg` command surface (version, models list, conversations list, files list). General shell execution is explicitly disabled in the environment example and code. A production isolated execution sandbox has not been established. Do not enable shell execution until a real per-user sandbox, resource limits, filesystem/network isolation and audit controls are deployed.

### Admin and staff

**PARTIALLY IMPLEMENTED.** An admin panel and server-side admin API exist. The current auth user role model inspected is `user | admin`; the requested granular staff roles, permission matrix, invitations, separation of duties and comprehensive staff lifecycle are not established by the inspected implementation. UI presence alone is not evidence of complete authorization.

### Localization

**PARTIALLY IMPLEMENTED.** Current language type and locale helpers support Dari and English (`fa-AF`, `en-US`) only. Pashto and Arabic are not present in the current language type/locale map. Full four-language parity and RTL QA remain outstanding.

### Cross-platform packaging

- **Web:** Vite app exists; PWA installability and full browser offline inference need separate verification.
- **Android:** Capacitor project configuration and native plugin source exist; APK build/runtime not verified in this audit.
- **iOS:** no native iOS target/project or verified local inference implementation found.
- **Windows/macOS/Linux:** no native desktop shell, installers or platform-specific inference packaging found.
- A shared web codebase does not establish native platform compatibility.

### Security, files and persistence

Security foundations include server-side auth, CSRF checks, password hashing dependencies, secret-redaction helper, upload validation helper and request/rate-limit logic. File upload/quarantine/scanning is not fully wired; provider/model-specific rate limits and observability need end-to-end verification; admin roles need stronger granularity. Conversation message persistence now accepts a client UUID and reuses the existing `messages.id` primary key for idempotent retries; this avoids a schema migration and remains compatible with older clients that omit the key. UI persistence is still best-effort, and no database-backed runtime verification has been performed. These gaps must not be described as production-ready.

## 4. Git and change-control audit

- Default branch: `main`; baseline tip is `95cd2ef...`.
- Latest main commit before this audit: “Center cinematic intro motion on mobile screens”.
- No open pull requests were returned by the repository PR search.
- Existing side branches were preserved and not merged. Compared with current `main`:
  - `feature/offline-ai-hub`: 0 ahead / 116 behind.
  - `feature/offline-ai-hub-global-catalog`: 0 ahead / 13 behind.
  - `fix/offline-model-catalog-reliability`: 3 ahead / 9 behind (diverged).
  - `offline-complete`: 136 ahead / 8 behind (diverged; too broad to merge blindly).
  - `remove-wallet-android-app`: 24 ahead / 864 behind (diverged).
  - `feat/minimal-workspace-ui`: 3 ahead / 185 behind (diverged).
- No branch was merged, no PR was merged, and no deployment was triggered.
- Remote GitHub API inspection cannot establish a local developer's uncommitted working-tree state.

## 5. First-priority execution plan

1. **Protect and verify the foundation:** establish the exact production database connection mode and health behavior; inspect all migrations and existing schema without applying them; document migration state as unknown until verified.
2. **Close core data integrity gaps:** make conversation/message writes idempotent and transactional; surface persistence failures; verify ownership boundaries and session behavior.
3. **Provider reliability and configuration:** keep credentials server-side; formalize provider configuration and adapter contracts; preserve explicit provider/model privacy and cost selection; remove Gemini as any implicit default path unless deliberately configured by the owner.
4. **Offline model lifecycle:** audit Android download pause/resume/checksum/install/runtime paths and browser storage limitations; gate model cards on actual runtime compatibility; avoid claiming cross-platform inference.
5. **Admin authorization:** define backend-enforced granular permissions before exposing staff workflows; audit all privileged mutations.
6. **Terminal safety:** keep shell disabled until an isolated sandbox is implemented and independently verified.
7. **Localization and platform packaging:** add Pashto/Arabic systematically; plan iOS and desktop targets only with real packaging/runtime evidence.
8. **Design and accessibility:** continue mobile-first responsive polish after critical functional and security paths are stable.

## 6. Verification and deployment status

- Repository tree/source inspection: **performed** (GitHub source inspection).
- Local working-tree status: **not available through the GitHub connector**.
- Tests, lint/type-check, builds, Android APK build, browser/device QA: **not run**, as required by the project rules.
- Database migrations: **not run**.
- Live Supabase/PostgreSQL connectivity: **not tested**.
- Provider connectivity/model discovery: **not tested live**.
- Render deployment state: **not checked in this audit**; no deployment initiated.
- Production runtime behavior must not be inferred from source inspection.

## 7. Mission status vocabulary

All major mission areas remain **PARTIALLY IMPLEMENTED**, **BLOCKED BY EXTERNAL REQUIREMENT**, or **NOT IMPLEMENTED** until their complete user journeys pass the repository acceptance criteria and authorized verification. No cross-platform, production-readiness or end-to-end completion claim is made by this baseline report.


## 8. Live execution milestone — core persistence and provider defaults

**Date:** 2026-11-03  
**Branch:** `main`

Changes committed after the baseline audit:

- `src/api/conversations.ts`: accepts an optional UUID idempotency key, inserts it as the existing message primary key, returns the already-created message for an exact retry, rejects a reused ID with different content or an ID owned by another conversation, and keeps message insertion plus conversation timestamp updates in one transaction.
- `src/App.tsx`: new chat messages use stable UUIDs and reuse the same UUID when saving user and assistant messages. Legacy seed-message IDs are normalized to a generated UUID for their one-time import.
- `src/providers/openAiCompatible.ts`: removed implicit Gemini endpoint/key inference. The adapter is only configured with explicit `OPENAI_COMPAT_BASE_URL` and `OPENAI_COMPAT_API_KEY` values.

The first implementation draft briefly introduced a schema migration, but source review showed that the existing `messages.id` UUID primary key can provide the idempotency guarantee without changing the database schema. That unnecessary migration was removed before delivery. No migration was applied or is required for this change.

**Verification boundary:** the updated source files were fetched again from GitHub and the expected idempotency, transaction, UUID reuse, and explicit-provider configuration code paths were confirmed by source inspection. No tests, type-check, build, live database query, provider smoke test, APK build, or deployment was run.


### Live execution update — administrator bootstrap

The one-time administrator bootstrap now uses a PostgreSQL transaction-scoped advisory lock to serialize concurrent first-admin requests. The active-administrator check and account promotion/creation run in the same transaction. Inactive accounts are rejected rather than silently reactivated, and the session is created only after commit. This is source-level implementation only; no live concurrency/database test was run.


### Live execution update — administrator lifecycle protection

The `PATCH /api/admin/users` mutation now serializes with first-admin bootstrap using the same transaction-scoped advisory lock. It locks the target user row, prevents demotion/suspension of the final active administrator, and commits the user change, session revocation and audit record together. Source-level only; no database or concurrency test was run.


### Live execution update — provider/model/fallback audit integrity

Provider toggles, model configuration changes and fallback-chain updates now execute with their audit-log inserts in the same PostgreSQL transaction. A failed audit write rolls back the associated mutation. Source-level only; no database tests were run.


### Milestones 6–7 — Database success signal and provider configuration clarity

- `src/api/database.ts` now emits `SUCCESS SUPABASE_DATABASE_CONNECTED` only after a real successful `SELECT 1` through the configured pool. It emits once per process. This is source-reviewed but not live-connection verified.
- `.env.example` no longer advertises implicit Gemini selection; provider setup is explicitly opt-in.
- No database credentials were introduced, and no migration/deployment was performed.


### Model routing safety update

- Manual model requests are pinned and fail closed when the selected model is not healthy; they are no longer silently replaced.
- Auto mode uses only the administrator-configured ordered fallback model IDs for subsequent failover. The IDs must resolve to enabled, recently verified text-streaming models.
- Source reviewed only; CI/runtime verification pending.
