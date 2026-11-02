# AFG AI repository gap analysis — Phase 1 start

**Inspection scope:** Git tree and all 117 tracked paths on `main`; root configuration and environment example; runtime/deployment entry points; database schema and migrations; API router, authentication, conversations, chat handler, provider gateway/adapters; chat UI, History UI, shared schemas, translations and existing delivery/acceptance documentation.

**Inspection method:** GitHub source inspection only. No runtime, dependency, database, provider, browser, build or deployment checks were performed. A missing root `README.md` was confirmed by repository contents lookup.

## 1. Repository map

- **Frontend:** Vite + React 19 under `src/`; AFG UI components under `src/components/afg/`.
- **Backend:** Express production server (`server.ts`) and shared Vite middleware (`vite.config.ts`), routed through `src/api/http.ts`.
- **AI gateway:** `src/services/providerGateway.ts`, `src/services/chatService.ts`, provider adapters under `src/providers/`.
- **Database:** PostgreSQL schema and four ordered migration files under `database/`; runner at `scripts/migrate.ts`.
- **Android:** Capacitor configuration and APK workflow.
- **Documentation:** security, reliability, architecture, delivery, acceptance, report format, i18n and deployment-related guides. There is no root README in the inspected tree.

## 2. Gap analysis

### Core chat and provider path

**Exists**
- Chat endpoint validates a shared Zod schema, bounds request size and message count, applies a 60-second generation timeout, supports abort, SSE metadata/content/error events and request IDs.
- Provider gateway registers Cloudflare Workers AI and an OpenAI-compatible adapter; model discovery, health checks, capability flags and administrator model overrides exist.
- Chat service retries before emitting content, avoids replay after partial output, and selects only recently health-verified streaming text models.
- API-wide request logging and database-backed IP/user/tier rate limiting exist when PostgreSQL is configured.

**Broken or risky**
- The API-wide model limiter trusts the client-supplied `X-AFG-Model` header. It is not tied to the model actually selected by the server, so a caller can omit or falsify it and evade the intended model-specific limit.
- The chat client sends that header, but the server independently selects/possibly falls back to another model. The limiter therefore does not enforce the actual provider/model used.
- Chat accepts unauthenticated requests. This may be intentional guest access, but guest traffic is protected only by IP/global load shedding, not an authenticated per-user quota.
- The chat success path has no dedicated structured completion event in `chatHandler.ts`; the API boundary logs generic request completion, while provider failures have feature-specific logs.
- The UI has a three-attempt retry loop while the server/provider service also retries. Although partial output is not replayed, retry ownership is duplicated and should be consolidated after persistence integration.
- The UI error bubble can include a request ID only if the error payload was parsed; SSE and network interruption paths need explicit preservation checks.
- The UI currently sends attachment metadata in local message state but does not upload attachment bytes or pass usable file/image content to the model. File assistant capability correctly reports unavailable; attachment controls must not imply AI analysis works.

### Conversations and History

**Exists**
- PostgreSQL conversations/messages tables and authenticated owner-scoped CRUD routes exist.
- Create/list/open/rename/archive/delete and message list/append operations are represented in `src/api/conversations.ts`.
- CSRF is checked for state-changing conversation requests.

**Missing / incomplete**
- `AfgHistoryView.tsx` now loads signed-in conversation lists and messages through the owner-scoped API; guest History continues to use browser localStorage.
- `App.tsx` now creates a server conversation for signed-in chat and attempts to persist the user message before generation and the assistant result after completion/failure. New branch/retry/edit flows create a separate conversation and preserve the supplied context where possible.
- Persistence is best-effort: if a message write fails, chat continues and the UI does not yet show a persistent-history warning or queue a reliable resync. Message append and conversation timestamp updates now run in one transaction, but message writes are not idempotent. A failed user-message write can leave the generated answer only in local UI state/localStorage.
- Conversation API responses do not consistently carry the request ID, despite the outer HTTP router having one.
- Conversation append performs message insert and conversation timestamp update as separate queries, not one transaction.
- Message append endpoint is not idempotent; a retry can create duplicates.
- Existing pin behavior is local-only and not part of the current conversation API.
- The server conversation API requires authentication and DATABASE_URL; the UI does not currently distinguish guest-local history from signed-in server history.

### Authentication, database and configuration

**Exists**
- Argon2id password hashing, legacy hash verification, hashed session tokens, session revocation, CSRF double-submit checks and Google OAuth state validation are present.
- Registration and password-reset email delivery use Resend configuration.
- PostgreSQL schema, additive migrations, indexes and migration runner exist.
- `.env.example` lists database, Cloudflare, optional OpenAI-compatible provider, email/bootstrap, origin and upload quarantine configuration.

**Missing / needs operational verification**
- Database migrations have not been run or verified in this task.
- Authentication endpoints use `sendAuthJson` without a consistent request ID in their JSON bodies; the outer API boundary sets the response header and logs requests, but error correlation is inconsistent across route families.
- Email verification and password reset depend on configured Resend credentials and sender identity.
- Root README setup instructions are absent.
- The migration history and `database/schema.sql` both define overlapping schema evolution; operational instructions need to make the migration runner the single clean-install path and explain legacy schema usage.

### UI, localization and capability gating

**Exists**
- Mandatory first-launch Dari/English selection, RTL/LTR application, locale persistence endpoint and theme state exist.
- Chat input is disabled when there are no verified chat models.
- TTS UI checks capability availability; file assistant snapshot explicitly returns unavailable; image/video capabilities have server-side capability checks in parts.

**Incomplete**
- Translation dictionaries have English and Dari, but visible UI still contains hardcoded strings and untranslated admin/tool/history labels; full EN/FA parity is not established.
- Chat subtitle claims support for Pashto although the product language selector supports only Dari and English.
- A number of UI tools and settings have not been verified end-to-end; capability gating is inconsistent outside chat/TTS/file status.
- Some UI actions (message edit/delete/branch) mutate only in-memory state and are not reflected in persisted messages.
- User-facing error/loading/disabled explanations and keyboard/accessibility behavior have not been comprehensively verified.

### Other features / fake or unavailable capabilities

- **File processing:** explicitly disabled in the capability snapshot until private storage, extraction, malware scanning and quotas exist. Upload security helper exists but is not an end-to-end upload service.
- **Image generation/editing:** gateway checks declared capability and adapter method before exposing available providers; actual availability depends on provider configuration and live verification. Do not assume a configured key implies support.
- **Video generation:** capability is hard-coded false in the capability snapshot; UI must remain disabled or clearly explain unavailability.
- **Vision/OCR:** only available if a verified adapter advertises the capability and implements image analysis. No general end-to-end UI/API/persistence path was verified in this inspection.
- **Voice:** routes and adapter interfaces exist; capability depends on verified provider support. The chat view uses a direct fetch to the server voice route, not a direct provider call.
- **Research:** capability is currently inferred from presence of `TAVILY_API_KEY`; a configured key alone is not proof of live provider health.
- **Productivity:** UI/API/persistence pieces exist, but individual tools require separate acceptance checks.
- No hardcoded provider secret was observed in the inspected `.env.example` or gateway source. A complete secret scan was not performed.

## 3. Phase 1 scope selected from the gaps

Highest leverage is to make the existing core path honest and enforceable before adding new tools:

1. Enforce model-specific rate limits against the **actual server-selected provider/model**, never a client header.
2. Emit explicit structured chat success/failure observability with request ID, actual provider/model, safe user ID and duration.
3. Make conversation API responses consistently correlate with the outer request ID.
4. Harden the newly connected signed-in chat/History persistence path: visible save-state/error recovery, idempotent message writes, atomic message/timestamp updates, and database synchronization for edit/delete.
5. Migrate or explicitly offer import of legacy local sessions; preserve unsent prompts and drafts across auth/network failures.
6. Complete the EN/Dari UI audit and verify all Phase 1 acceptance criteria when verification is authorized.

This task begins with items 1–3 as focused backend hardening. Items 4–5 remain the next implementation milestone if not completed in this change. No unsupported provider feature will be enabled to make the interface appear fuller.


## 4. Changes made during this task

Committed to `main` after the source review:
- Removed the generic API middleware's model limiter that trusted the client-controlled `X-AFG-Model` header.
- Moved model-specific rate enforcement into the chat stream's asynchronous gateway model-selection callback. The policy key is now built from the actual provider/model selected by the gateway, including fallback candidates; each candidate is counted at most once per request. If the database-backed limiter is unavailable, the chat fails closed for that model-selection attempt. If no database is configured, model-specific distributed limiting is unavailable and only the existing process-level concurrency guard remains.
- Added a feature-specific structured chat success event and retained structured stream failure/empty-response events. The completion/failure logs now identify the actual selected fallback model rather than always reporting the originally prepared model.
- Added the outer request ID to conversation API JSON responses when the shared HTTP boundary supplies it.
- Made message insertion and conversation timestamp updates atomic in one database transaction.
- Removed the obsolete client-supplied model-limit header from the chat UI.
- Added the missing root `README.md` with local setup, migration, provider, environment, Android and operational guidance.
- Expanded `.env.example` with the OAuth, email and research variables used by the inspected code, and corrected its database migration instructions.

**These are focused improvements, not a complete Phase 1 delivery.** Signed-in chat and History now call the conversation API, but this path has not been runtime-verified; writes are best-effort and non-idempotent; migration state is unknown; and message edit/delete operations are not synchronized to the database. Legacy local sessions are not migrated to server conversations. These are the highest-priority remaining implementation tasks.

## 5. Verification boundary

This is source inspection, not runtime proof. No tests, type-check, lint, build, database migration, provider smoke test, manual UI verification or deployment were run. Provider availability, deployed environment values, live database schema and current production behavior remain unverified.
