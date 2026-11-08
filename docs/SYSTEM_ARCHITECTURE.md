# AFG AI — System Architecture

Last reviewed: 2026-11-01

## 1. Runtime architecture

The project remains the existing React/Vite/Capacitor client and Express server on Render. This is a modular monolith, not a deployed Workers/D1/R2/KV/queue architecture.

**Client:** React 19 + TypeScript + Vite + Capacitor Android. Chat, local conversation history, settings and authenticated admin UI.

**API edge:** shared route handler with request IDs, CORS, structured logs, input limits, auth/session + CSRF, admin authorization, health, models, capabilities and chat.

**Services:** chat service and provider gateway with health verification, context fitting, extractive summary, cost-based auto-selection and admin fallback order.

**Adapters:** Cloudflare Workers AI and optional OpenAI-compatible adapter.

**Persistence:** PostgreSQL when configured and schema applied; stores users, hashed sessions, provider/model enablement, pricing, fallback chains and audit records.

## 2. Client layer

- React 19, TypeScript, Vite, Tailwind and Capacitor remain the client stack.
- English and Dari are supported; Dari enables RTL.
- The model picker groups discovered models by provider and shows capability labels. Unverified/disabled models remain disabled with a reason.
- Chat streams with SSE, server heartbeat comments every 15 seconds, and client retry with exponential backoff (500 ms, 1 s) only before any response text has arrived. Once partial output exists, the client does not replay the request, avoiding duplicate output.
- Stop cancels the browser request; the server propagates cancellation to the provider fetch.
- Conversation history currently uses browser localStorage. It supports search across saved messages, rename, pin, Markdown/JSON export, print-to-PDF, delete and clear. This is device/browser-local, not synchronized cloud persistence.
- Markdown rendering uses ReactMarkdown with GFM tables, math/LaTeX and syntax highlighting. Raw HTML is disabled; ReactMarkdown renders text through React elements and does not inject model HTML.
- Image/video generation, vision, file processing, research and server-side voice features remain disabled unless a real adapter/service advertises them.

## 3. API edge and route contract

Production Express (server.ts) and Vite development both use src/api/http.ts.

| Method | Route | Purpose |
|---|---|---|
| GET | /api/health | Process health |
| GET | /api/ready | PostgreSQL readiness |
| GET | /api/models | Selectable verified chat models |
| GET | /api/capabilities | Capability snapshot and all discovered model descriptors |
| POST | /api/chat | Validated chat request and SSE stream |
| POST | /api/auth/login | Email/password sign-in for provisioned accounts |
| POST | /api/auth/bootstrap-admin | One-time first-admin bootstrap |
| GET | /api/auth/me | Current session and account preferences |
| PATCH | /api/auth/preferences | Set a health-verified per-user default model |
| POST | /api/auth/logout | Revoke current session |
| GET | /api/admin/providers | Admin provider registry |
| GET | /api/admin/models | Admin model registry, health and pricing |
| GET | /api/admin/fallbacks | Capability fallback chains |
| PATCH | /api/admin/providers | Enable/disable a provider |
| PATCH | /api/admin/models | Enable/disable a model and set pricing |
| PATCH | /api/admin/fallbacks | Configure capability fallback order |

All requests receive a server-generated request ID. Logs contain request ID, method, path, status and duration, not prompts, passwords, session tokens or provider credentials. Chat input is bounded (1 MB request body, message count/content limits, and 200,000 total message characters). Each process accepts at most four concurrent chat requests; this is load shedding, not a distributed per-user quota.

CORS reflects only configured APP_ORIGIN entries and the local/Capacitor development allowlist. Credentialed requests use an HttpOnly session cookie and a separate CSRF cookie/header pair for state-changing authenticated operations.

## 4. Provider registry and contract

The canonical ProviderAdapter and ModelDescriptor types are in src/providers/providerTypes.ts. Required adapter methods are config validation, model discovery, model-specific health check, capability reporting and streaming chat. Image, vision, transcription, synthesis and embedding methods are optional and are not advertised until implemented.

Registered adapters:
- Cloudflare Workers AI: registered in source; requires server-only CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
- OpenAI-compatible: always appears in the registry; it becomes usable only when OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_API_KEY are both present. It uses /models and /chat/completions; the base URL must be HTTPS in production.

Model references sent through the client/API are provider-qualified as providerId::modelId, avoiding collisions when providers expose identical model IDs. Provider secrets are never sent to the client or stored in provider configuration rows.

Each model is probed with a bounded inference request. Successful health results are cached per server process for five minutes. A model is selectable only when its provider is configured/enabled, the model is enabled, the health probe succeeded recently, and the requested capability is supported. The chat service repeats the verification before inference.

### 4.1 Model routing

- Manual selection is grouped by provider.
- Auto selects the lowest combined input/output price among healthy, enabled text+streaming models when pricing has been configured by an administrator.
- If no trustworthy price metadata exists, auto mode uses the administrator's healthy fallback order; if none is configured, it chooses the first healthy model in registry order as a deterministic default. It does not claim that this unpriced default is the cheapest.
- If a manually selected model becomes unhealthy, the configured fallback order is tried before cost-based selection.
- Fallback chains are capability-specific: text, vision, imageGen, tts and stt. Only discovered enabled models advertising the selected capability can be saved.
- User default model preference is stored in users.default_model and must reference a currently health-verified model.

### 4.2 Context management and response integrity

- The service uses provider-supplied context window metadata when available, reserves headroom and compacts older conversation turns into an explicitly labelled extractive summary.
- When the provider does not publish context metadata, AFG_UNKNOWN_CONTEXT_BUDGET (default 8192 estimated tokens) is a conservative configurable budget; it is not represented as the provider's actual context window.
- The server rejects client-supplied system-role messages and creates its own system instruction, which requires uncertainty honesty and forbids fabricated citations, URLs, quotations and tool results.
- The server emits an error for empty provider output. The client hides empty streaming bubbles and shows a retryable error instead.
- Client retries use exponential backoff only when no text has been received. Partial output is preserved and not silently replayed.

## 5. Authentication, admin controls and persistence

- src/api/auth.ts implements scrypt password verification, hashed opaque session tokens, HttpOnly session cookies, CSRF double-submit validation and sign-in throttling.
- The first administrator is created through POST /api/auth/bootstrap-admin, protected by server-only AFG_ADMIN_BOOTSTRAP_TOKEN (minimum 32 characters). Bootstrap closes after an active admin exists.
- Admin APIs enforce the database-backed users.role = admin on the server. Provider/model toggles, model pricing and fallback chains are persisted in PostgreSQL and written to audit_logs.
- The admin UI does not accept or display provider secrets. Provider credentials remain environment-only.
- database/schema.sql includes additive columns for password hashes, default model, model costs/health metadata and fallback chains. The schema is not auto-applied; an operator must apply it before using database-backed auth/admin endpoints.
- The app does not yet provide public user registration, email verification, Google OAuth, account recovery or a complete user-management dashboard.
- Conversations/messages are not yet persisted to PostgreSQL. Current history is localStorage-only.
- User ownership enforcement for server-side conversations/assets, usage metering and per-user quotas are not implemented.

## 6. Security controls and remaining gaps

Implemented:
- Server-only provider credentials.
- Database-backed session authentication for provisioned accounts.
- Hashed session tokens, HttpOnly session cookie and CSRF validation for authenticated writes.
- Server-side admin role checks; no client-only admin authorization.
- One-time, secret-protected admin bootstrap.
- Admin audit records for provider/model/fallback changes.
- CORS allowlist, request IDs, bounded inputs, safe errors and provider timeouts.
- No raw HTML rendering for model-generated Markdown.

Remaining:
- Public registration, verified email/Google OAuth, recovery and full account management.
- Distributed login/chat rate limits and per-user quotas/spend controls.
- Persistent conversation/message APIs, server-side ownership checks and cross-device history.
- Distributed provider health cache and multi-instance coordination.
- Provider-specific retries for requests after partial stream output, resumable SSE/event IDs.
- Actual pricing feeds; prices are administrator-entered metadata and must be kept current.
- Vision, image generation, video, file-processing workers, TTS/STT, embeddings, research and object storage.
- Database migration automation, backup/retention/deletion workflows and production security review.

These gaps mean the project is not yet a fully production-ready public multi-user AI platform. Do not infer a capability from a UI label or schema table alone.

## 7. Environment configuration

Server-only:
- CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
- Optional OpenAI-compatible: OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_PROVIDER_ID, OPENAI_COMPAT_DISPLAY_NAME
- AFG_ADMIN_BOOTSTRAP_TOKEN (one-time secret; minimum 32 characters)
- DATABASE_URL, DATABASE_SSL, DATABASE_SSL_REJECT_UNAUTHORIZED, DATABASE_POOL_MAX
- APP_ORIGIN (comma-separated trusted browser origins)
- AFG_UNKNOWN_CONTEXT_BUDGET (estimated-token budget when provider context metadata is absent)

Public client setting:
- VITE_API_BASE_URL (optional API base URL; never put secrets here)

Render supplies PORT. There is no Render Blueprint, Dockerfile, D1 binding, R2 binding, KV namespace, queue or Worker deployment configuration checked into this repository.

## 8. Change validation

Source files and documentation were updated through GitHub. No tests, type checks, builds, database migrations, workflow runs or deployments were executed. Runtime/compile status is therefore unverified.


## Durable model routing, agent execution and file/media lifecycle

- `src/services/modelRouter.ts` ranks only recently health-verified models that advertise the requested capability. It preserves provider-qualified model IDs, honors the configured fallback chain/provider order, supports cost bounds, and can prefer the local Ollama provider when `AFG_AI_PREFER_OFFLINE=true`. The existing provider gateway remains the source of truth for provider registration, health, admin enablement and capability declarations.
- Chat Auto mode uses the model router when local preference is enabled; tool-enabled turns use capability-aware routing. Manual model selection remains pinned, and configured fallback policy is not bypassed.
- Agent tasks continue to use the existing `agent_tasks`, `agent_steps` and `agent_events` tables and the existing worker. Migration 0052 adds progress, checkpoints, heartbeat timestamps and JSON event payloads. Owner-scoped SSE endpoints expose task updates and support `Last-Event-ID`.
- A worker that stops heartbeating for 90 seconds is marked interrupted. Running steps and media jobs are failed with a safe interruption code. The runtime never automatically repeats an uncertain external side effect or potentially billed media request; the user must inspect and explicitly resume eligible agent tasks.
- Private files still enter quarantine through `/api/files` and require a configured ClamAV scan before they can be used as media inputs. Media work is queued through `/api/media/jobs`, linked to the existing agent queue, and emits a real database-backed SSE snapshot at `/api/media/jobs/:id/events`. No client upload is silently sent to an external provider; explicit external-processing permission remains required.
- `AFG_AI_PREFER_OFFLINE=true` is a preference, not a guarantee of offline operation. It can select only a verified local Ollama endpoint reachable from the AFG AI server. If no local model is healthy, Auto may choose another verified model; users who require strict offline mode must not assume network isolation from this preference alone.
