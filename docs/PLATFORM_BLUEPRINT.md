# AFG AI — production platform roadmap

This repository is the existing AFG AI application. The current runtime is React + Vite on the frontend and an Express API on Render. Keep that working deployment as the first production target; Cloudflare Workers is an optional later runtime, not a reason to replace the working app prematurely.

## Platform architecture

- Web/mobile UI: React 19, TypeScript, Vite, Tailwind; Capacitor Android wrapper.
- API runtime: existing Express server on Render. Keep provider secrets server-side.
- AI gateway: provider adapters behind one API contract. Cloudflare Workers AI is the current adapter; additional providers are added independently and selected through server configuration.
- Database: PostgreSQL. Apply `database/schema.sql` to the production database before enabling persistence.
- Object storage: S3-compatible or Cloudflare R2 for generated media and user uploads; never store large binary assets in PostgreSQL.
- Authentication: Google OAuth and email verification with short-lived access sessions, hashed refresh/session tokens, CSRF protection for cookie flows, and server-side role checks.
- Observability: structured request IDs, provider latency/error metrics, usage events, audit logs, and health/readiness endpoints.

## Database

The schema creates users, external auth identities, sessions, conversations, messages, provider/model configuration, usage events, generated assets, API keys, and admin audit logs. It is designed for PostgreSQL 15+.

1. Provision PostgreSQL (Render Postgres, Supabase Postgres, or another managed PostgreSQL service).
2. Set `DATABASE_URL` as a private server environment variable.
3. Apply `database/schema.sql` once using the provider's SQL console or `psql`.
4. Keep database credentials out of frontend variables and Git.

The application must treat database unavailability as a degraded state, not silently pretend that data was saved.

## Provider contract

All providers should implement the same server-side adapter contract: list supported models, validate capability, generate/stream output, normalize provider errors, and report token/usage metadata. Provider API keys belong only in server environment variables or a secrets manager. Never send provider credentials to the browser.

Initial provider: Cloudflare Workers AI (already connected in `src/api/chatHandler.ts`). Add other providers as isolated adapters; a provider failure must not expose secrets or return a fake successful answer.

## Product capabilities

- Chat: streaming, model selection, conversation persistence, attachments, regenerate/copy, and per-user usage limits.
- Creation: image/video/audio generation through providers that actually support those tasks; show capability and quota state before submission.
- Knowledge: document upload, extraction, safe parsing, retrieval, and citations.
- Tools: translation, summarization, coding assistance, document utilities, and structured tool execution with permission checks.
- Accounts: Google/email authentication, profile, sessions, data export, and account deletion.
- Admin: role-protected user/provider/model/quota controls, usage analytics, audit history, and service health.
- Localization: language selection at first launch; after selection render one language only. Support English, Dari, Persian, Pashto, and Arabic with correct RTL/LTR behavior.

## Security release gates

- Restrict CORS to configured trusted origins; never use wildcard CORS with credentialed requests.
- Validate request shape, role, message count, and payload size on the server.
- Apply authentication, per-user rate limits, abuse controls, and provider spend limits before public launch.
- Hash session/API tokens; never store raw secrets.
- Enforce authorization on every admin and user-data endpoint.
- Validate uploaded file type and size; scan/process files in isolated workers.
- Add retention/deletion rules for chat, uploaded files, generated assets, and audit records.
- Do not claim a capability is live until its provider integration and storage path are configured.

## Delivery phases

1. Foundation: PostgreSQL schema, environment configuration, API hardening, readiness checks.
2. Identity and persistence: Google/email auth, session lifecycle, chat history and user settings in PostgreSQL.
3. AI gateway: provider adapter registry, model/capability catalog, usage metering and limits.
4. Creation and knowledge: image/video/audio, uploads, document analysis, object storage and retrieval.
5. Operations: admin dashboard, audit logs, observability, backups, load/security review.
6. Runtime portability: add a Cloudflare Worker entrypoint only after the shared API/provider contracts are runtime-neutral.

Do not run CI/tests or production migrations without an explicit request. This roadmap does not imply that authentication, database connectivity, or every listed capability is already implemented.

## Mission contract (non-negotiable)

AFG AI is one unified platform: one AI gateway, multiple verified capabilities, one consistent account and data model.

- No fabricated results, demo records, or mock actions in production UI. A capability without a configured and verified integration must be clearly unavailable and must not accept a fake job.
- The backend is the source of truth for provider and model availability. The model catalog endpoint must return only models discovered from the live provider catalog. Chat requests re-check the selected model against the provider catalog before execution; a syntactically valid model ID is not proof of availability.
- Persist user actions only after authentication and authorization are implemented. Every persisted row must have an owner relationship, appropriate indexes, retention rules, and access controls. Never imply that browser-only state is durable.
- Every API response includes a request ID. Server logs use structured events and avoid logging credentials, raw tokens, or full private prompts.
- Localization is selected once and applied consistently. A selected locale must control all labels, messages, dates, accessibility text, and document direction. RTL locales are Dari, Persian, Pashto, and Arabic; LTR locales include English.
- A feature is considered released only after its provider integration, server validation, persistence, error handling, localization, and operational monitoring are complete.

## Current implementation truth

The existing app currently has a live Cloudflare Workers AI chat adapter and live model-catalog discovery. Image and video generation are intentionally disabled until real providers are connected. Chat history is currently not persisted to PostgreSQL; the schema and database connection foundation exist, but authentication, ownership enforcement, migrations, and persistence endpoints still need implementation. Do not advertise those unfinished systems as active.


## Layered architecture implementation

The current architecture is documented in [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md). The implementation now has a shared API edge used by both Vite development and the Express production server, a typed chat service, a provider gateway/registry, and a Cloudflare Workers AI adapter. `GET /api/capabilities` exposes live verified model IDs and backend capability flags. Only chat can currently be true; unsupported capabilities remain false.

This is a modular monolith, not yet a deployed Workers/serverless, WebSocket, or queue-based system. Authentication middleware, CSRF for cookie sessions, distributed rate limiting, multi-provider fallback/retries, usage metering, object storage, queues, and user-owned persistence remain future release work. The PostgreSQL schema is a foundation and does not itself activate persistence.



## Implementation status update — 2026-11-01

The following are now present in source:
- Shared API edge and SSE chat with heartbeat, cancellation, pre-first-token exponential retry, empty-output guard and uncertainty/source-honesty instruction.
- Provider adapter contract with Cloudflare Workers AI and OpenAI-compatible adapter (visible but disabled until configured); provider-qualified model references.
- Five-minute per-process model health verification, PostgreSQL provider/model enablement, administrator-entered prices and capability fallback chains.
- One-time admin bootstrap, database-backed hashed sessions, CSRF checks, server-side admin role enforcement and audit logging.
- Core message operations and localStorage conversation history with search, rename, pin, Markdown/JSON export, print-to-PDF, delete and clear.
- Markdown GFM tables, LaTeX and code highlighting with raw HTML disabled.

Still incomplete:
- Public user registration, email verification, Google OAuth and account recovery.
- PostgreSQL conversation/message persistence and cross-device history.
- Distributed rate limiting, spend quotas, distributed health cache and resumable SSE.
- Real image/vision/video/files/voice/research providers and object storage.
- Pricing feeds; auto-routing can only compare prices entered by an administrator.
- Full localization of every component.

The PostgreSQL schema is source-only until manually applied. No tests, type checks, builds, migrations, workflows or deployments were run. Do not describe the application as production-validated.
