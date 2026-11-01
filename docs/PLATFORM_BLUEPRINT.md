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
