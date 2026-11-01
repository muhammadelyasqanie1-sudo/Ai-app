# AFG AI — Operating Principles and Source Audit

## Non-negotiable rules

1. Inspect the existing code, routes, schema, environment contract, and deployment configuration before modifying anything.
2. Preserve working functionality and prefer focused refactors.
3. Do not ship simulated integrations. Disable unconfigured capabilities and explain why.
4. Keep credentials in server environment variables or secret stores; never hardcode them.
5. Redact secrets and private payloads from frontend output, logs, and error responses.
6. Enforce roles, ownership, quotas, and permissions on the server. Never trust client state for authorization.
7. Keep frontend API paths, backend routes, and model IDs identical across development and production.
8. Capability flags must reflect verified provider support.
9. Fail safely with structured errors, request IDs, bounded retries where appropriate, and preserved user input.
10. Do not run tests, builds, or deployments without explicit user approval. Source inspection and edits only.
11. Report changes, incomplete work, and required configuration honestly.
12. Keep the project deployable and document every required service or secret.

## Audit and changes in this pass

- Inspected the repository tree, primary React application, API handlers, database schema and connection helper, package scripts, environment sample, Vite config, Capacitor config, Android workflow, and Android build notes.
- Added `src/api/modelCatalog.ts` as the single live Cloudflare model discovery implementation. Express production and Vite development now share the same model IDs and verification rules.
- Model discovery returns verified only when at least one valid chat model is found. No hardcoded fallback model is used.
- Added allowlisted CORS support for configured origins and Capacitor localhost; request IDs are attached before API preflight responses.
- Removed raw upstream provider error bodies and database connection error details from logs. Chat errors shown in the UI are generic and safe.
- Disabled chat attachments until upload, storage, and model processing exist.
- Replaced fabricated admin metrics and client-only admin toggles with a disabled state. Removed false server-ready and notification indicators, fake sign-out, and the incorrect Premium guest label.
- Removed sample code output and fabricated document summaries. Translation, code generation, document processing, and file tools remain unavailable until real integrations exist.
- Removed fixed currency conversion rates. QR generation calls QRServer and discloses that submitted text is sent to that third party.
- Replaced the obsolete Gemini environment example with Cloudflare and PostgreSQL server-side variable names.
- Changed the Android APK workflow to manual dispatch only.

## Incomplete work and required configuration

- Chat requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the server secret store. Never put these in `VITE_*` variables.
- PostgreSQL schema and connection foundation exist, but authentication, migrations, persistent chat history, ownership checks, quotas, and user-data endpoints are not implemented. Do not run migrations as part of a source-only change.
- Google/email authentication and server-side admin authorization are not implemented; admin and sign-in/sign-out remain disabled.
- Image/video generation, translation, standalone code generation, PDF processing, file conversion, server-side transcription, and TTS are not connected.
- Chat is text-only. Browser speech recognition depends on device/browser support and is not a server transcription service.
- History is not persisted and remains empty rather than showing invented records.
- No Render Blueprint, Dockerfile, or deployment manifest exists in the repository. Render settings and auto-deploy behavior are external to source. The server start script is `tsx server.ts`; Render supplies `PORT`.
- The Android workflow accepts optional `api_base_url` at manual dispatch. An APK must target the deployed HTTPS API; an APK build does not deploy the backend.

Tests, lint, database migrations, and manual deployments were not initiated. Important exception: while the original workflow still had its `push` trigger, commits to `main` automatically triggered GitHub Actions APK builds. Runs #35–49 completed: 13 succeeded and 2 failed. The workflow is now manual-dispatch-only, so future pushes will not start APK builds. Render auto-deploy settings are external and must be checked in the Render dashboard; this repository cannot confirm whether those main-branch commits triggered a Render deployment.

## System architecture implementation pass (2026-11-01)

- Inspected the repository tree, source/configuration files, API routes, PostgreSQL schema, environment sample, Vite and Express entrypoints, Capacitor configuration, Android workflow, and deployment notes before changing architecture code.
- Added typed provider contracts in `src/providers/providerTypes.ts`, a Cloudflare Workers AI adapter in `src/providers/cloudflareWorkersAi.ts`, a provider registry/capability gateway in `src/services/providerGateway.ts`, and a verified chat service in `src/services/chatService.ts`.
- Moved live model discovery behind the provider gateway. Model identifiers are passed unchanged through the catalog, client selection, chat service, and provider adapter.
- Added `GET /api/capabilities`; the frontend now obtains its model list and capability flags from this backend response. Only chat is eligible to be reported as available. Image, video, vision, files, speech, TTS, and research remain false.
- Added `src/api/http.ts` as the shared API edge. Both Vite development and Express production now route through the same route table: `/api/health`, `/api/ready`, `/api/models`, `/api/capabilities`, and `/api/chat`.
- The home screen now displays provider status from the live capability response rather than claiming the service is always online. Unsupported capabilities remain described as unavailable.
- Documented the implemented and planned architecture in `docs/SYSTEM_ARCHITECTURE.md` and updated the platform blueprint.

Not implemented by this architecture-only pass: authentication/session middleware, CSRF tokens for cookie-authenticated routes, distributed/per-user rate limiting, multi-provider fallback, retries, usage metering, object storage, queues, WebSockets, migrations, and authenticated persistence. These remain explicit gaps, not simulated features.

No tests, type checks, builds, migrations, workflow runs, or deployments were initiated.


## Provider Gateway Contract 2.2 implementation (2026-11-01)

- Expanded `src/providers/providerTypes.ts` with the canonical `ProviderAdapter`, `ModelDescriptor`, `CapabilityFlags`, health/config status types, typed chat chunks, and optional image/audio/embedding request/result contracts.
- Updated the Cloudflare Workers AI adapter to implement required config validation, live model listing, model-specific health checks, capability reporting, and typed streaming chat. Optional capabilities are deliberately not implemented or advertised.
- Added a five-minute process-local health cache and bounded four-at-a-time model probes in the provider gateway. Only enabled models with a recent successful health probe and text+streaming support are selectable.
- The chat service rechecks model verification on the server before every inference. Client model selection is never treated as authorization.
- `GET /api/capabilities` returns full model descriptors, including disabled entries and the exact `Provider not reachable.` reason. The model picker displays unverified entries as disabled; `GET /api/models` returns selectable IDs only.
- Known gap: `enabled` currently defaults to true because authenticated admin controls and persistent provider-model settings are not yet implemented. Health cache is per process/Render instance, not distributed. Context window is zero when the provider catalog does not supply it.
- Updated `docs/SYSTEM_ARCHITECTURE.md` with the contract and explicit boundaries.

No tests, type checks, builds, workflows, migrations, or deployments were run.


## Superseding implementation update — 2.3, 3.1 and 3.2 (2026-11-01)

This section supersedes earlier statements in this document that admin controls, all auth sessions, multi-provider registration and chat operations were entirely absent. It does not imply that all items in the feature specification are complete.

### 2.3 Provider Registry & Admin Controls

Implemented:
- Registry now supports Cloudflare Workers AI and an optional OpenAI-compatible adapter, registered in the admin registry at all times, but only becomes usable when its server-side base URL and API key are configured.
- Provider and model enablement is stored in PostgreSQL; model pricing is administrator-entered and stored per model.
- Admin UI supports provider enable/disable, model enable/disable, pricing entry and capability-specific fallback-chain editing.
- Admin APIs require a database-backed session and server-side users.role = admin authorization. State-changing admin APIs require CSRF validation.
- First-admin bootstrap requires AFG_ADMIN_BOOTSTRAP_TOKEN (minimum 32 characters) and closes after an active admin exists. Password hashes use Node scrypt; session tokens are hashed in PostgreSQL; session cookies are HttpOnly.
- Provider/model/fallback changes are written to audit_logs.
- Fallback chain entries are checked against discovered, enabled models and advertised capability flags.

Remaining:
- No public user registration, email verification, Google OAuth, recovery or full user-management workflow.
- Provider secrets remain environment variables and are not editable from the admin UI.
- Database schema must be applied manually. No migration or deployment was run.
- Registry currently contains two adapter implementations at most; vision/image/audio/embedding methods are not implemented by them.

### 3.1 Core AI Chat

Implemented:
- SSE heartbeat comments every 15 seconds.
- Exponential retry (500 ms, then 1 s) for connection/overload failures only before any response text is received. Partial output is preserved rather than replayed.
- Stop action propagates abort from client to provider request.
- Context is fitted to provider-supplied context-window metadata when available; older turns are compacted into a clearly labelled extractive summary. If metadata is absent, AFG_UNKNOWN_CONTEXT_BUDGET is used as a conservative estimate.
- Copy, regenerate/retry, edit-and-resend, stop, branch and delete message controls.
- Conversation history in localStorage supports new/search/rename/pin/export Markdown/export JSON/print-to-PDF/delete/clear.
- Markdown rendering supports GFM tables, LaTeX math and syntax highlighting. Raw HTML is disabled.
- Empty assistant streaming bubbles are hidden; empty provider responses become retryable errors.
- System instructions require uncertainty honesty and prohibit fabricated citations, links, quotations and tool results.

Remaining:
- Conversation history is device/browser-local, not PostgreSQL-backed or synchronized between devices.
- SSE does not yet support event IDs or server-side stream resumption after partial output.
- Context compaction is extractive, not an LLM-generated semantic summary.
- Full end-to-end behavior remains unverified because tests/builds were not run.

### 3.2 Multi-Model System

Implemented:
- Live discovery for each registered/configured adapter.
- Provider-qualified model references (providerId::modelId) prevent collisions between providers.
- Manual model selection is grouped by provider and displays capability labels.
- Auto mode chooses the lowest combined input/output price among healthy enabled text models when admin pricing exists. Without pricing, it uses the configured healthy fallback chain and does not claim to know the cheapest model.
- If a manually selected model is no longer healthy, the configured fallback chain is tried before cost-based fallback.
- Admin enable/disable is persistent for providers and models.
- Authenticated users can store a default model preference; the client loads and updates it when a valid session exists.

Remaining:
- Cost values are administrator-entered metadata, not live provider price feeds.
- Fallback routing is wired for chat text. Other capability chains are configurable but cannot be exercised until real adapters implement those capabilities.
- Per-user default preferences require a provisioned authenticated account; a public signup/verification flow is not implemented.

No tests, type checks, builds, migrations, workflows, or deployments were run for this feature pass.
