# AFG AI — System Architecture

Last reviewed: 2026-11-01

## 1. Runtime architecture

The current production runtime remains the existing Express application on Render. Vite is the development runtime and uses the same API request handler. Cloudflare Workers, D1, R2, KV, Queues, and WebSockets are not deployed components in this repository.

```text
┌──────────────────────────────────────────────────────────────┐
│ CLIENT                                                        │
│ React 19 + TypeScript + Vite + Tailwind + Capacitor Android   │
│ Chat UI · Home · Tools · Image/Video unavailable · Settings   │
│ Mobile-first layout · current locale: English or Dari         │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / JSON / Server-Sent Events
┌──────────────────────────────▼───────────────────────────────┐
│ API EDGE                                                      │
│ src/api/http.ts                                               │
│ Shared route table · CORS allowlist · request IDs             │
│ structured request logs · HTTP status/error envelopes        │
│ request-size and chat-input validation · bounded chat concurrency        │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ SERVICE LAYER                                                 │
│ src/services/chatService.ts                                   │
│ src/services/providerGateway.ts                               │
│ Verified model selection · capability snapshot                │
│                                                              │
│ PROVIDER ADAPTER REGISTRY                                     │
│ src/providers/cloudflareWorkersAi.ts                          │
│ Cloudflare Workers AI · live model catalog · streaming chat   │
│ Other providers/capabilities are not registered yet           │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ PERSISTENCE                                                   │
│ PostgreSQL schema + pg connection/health foundation           │
│ No active auth, conversation persistence, object storage,     │
│ KV cache, queue workers, or generated-asset storage           │
└──────────────────────────────────────────────────────────────┘
```

## 2. Client layer

- React 19 and TypeScript render the web interface.
- Vite provides local development and the production asset build.
- Capacitor packages the same web client for Android.
- The browser calls the same API paths in development and production.
- `VITE_API_BASE_URL` is an optional public base URL for a separately deployed API. It must never contain provider credentials.
- The app reads `GET /api/capabilities`; model IDs and enabled capability flags come from the server. If the endpoint cannot verify the provider, chat models are cleared and chat is unavailable.
- The current UI supports English and Dari. RTL is enabled for Dari. AI output is rendered through React text nodes and a simple Markdown parser rather than raw HTML injection. Other locales and full translation of every component are future work.
- Image, video, document processing, standalone translation, research, server-side speech-to-text, and TTS remain disabled because no matching backend services are registered.

## 3. API edge and route contract

Both runtimes use `src/api/http.ts`:

- Production: Express in `server.ts`, mounted under `/api`.
- Development: Vite middleware in `vite.config.ts`.
- The shared handler uses the original URL so Express mounting does not change route matching.

| Method | Route | Contract |
|---|---|---|
| GET | `/api/health` | Process health; does not promise provider or database readiness |
| GET | `/api/ready` | Database readiness; returns degraded when PostgreSQL is not configured or reachable |
| GET | `/api/models` | Live provider-verified chat model IDs |
| GET | `/api/capabilities` | Live capability snapshot and verified model IDs |
| POST | `/api/chat` | Validated JSON request; SSE response |

All API requests receive a server-generated `X-Request-Id`. API request logs contain request ID, method, path, status, and duration; prompts, authorization headers, and provider tokens are not logged. API JSON responses are non-cacheable and include the request ID. Chat uses bounded request and message sizes, validates roles/model shape/live model membership, and limits each server process to four concurrent chat requests with a 5-second Retry-After response when saturated. This is load shedding, not a per-user rate limiter.

CORS only reflects origins configured in `APP_ORIGIN` or the local/Capacitor development allowlist. The current API does not use cookie authentication, so a cookie-based CSRF token flow is not active.

## 4. Service layer and provider gateway

- `src/services/chatService.ts` validates the selected model against a fresh provider catalog before preparing inference.
- `src/services/providerGateway.ts` owns the provider registry and computes the public capability snapshot.
- `src/providers/providerTypes.ts` defines typed provider, model, chat input, capability, and error contracts.
- `src/providers/cloudflareWorkersAi.ts` is the only registered provider adapter. It discovers models from the live Cloudflare account catalog and streams chat responses.
- Model IDs are passed unchanged from provider catalog to API response, client selection, chat request, and provider adapter.
- A catalog failure produces an unavailable result; there is no hardcoded model fallback.
- Only chat can currently be reported as available. Vision, image/video generation, files, speech, TTS, and research are explicitly false.
- There is no multi-provider fallback, retry policy, per-user/distributed rate limiter, usage metering, or distributed health registry yet. Provider calls have bounded network timeouts; a failed stream is surfaced as an SSE error rather than a fake completion.

## 5. Persistence and background processing

- `database/schema.sql` defines PostgreSQL tables for users, identities, sessions, conversations, messages, providers, models, usage, assets, API keys, and audit logs.
- `src/api/database.ts` creates a server-side PostgreSQL pool and exposes a connection check.
- The schema is not automatically migrated by application startup.
- The app does not yet create authenticated users or sessions, persist conversations/messages, enforce row ownership, meter usage, or store generated assets.
- R2/S3-compatible object storage, KV/cache, queues, and background workers are not configured or used. No binary file or generated asset is claimed to be saved.
- Do not enable persistent user data until authentication, server-side ownership checks, migrations, and retention/deletion rules are implemented.

## 6. Security controls and explicit gaps

Implemented:
- Server-only Cloudflare credentials.
- CORS origin allowlist.
- Server-generated request IDs and sanitized structured logs.
- Bounded chat request size, message count, and content size.
- Live model verification before chat inference.
- Safe, normalized provider errors and bounded provider request timeouts.

Not implemented yet:
- Authentication middleware, session lifecycle, OAuth/email verification.
- Server-side user roles, resource ownership, quotas, and admin authorization.
- Cookie CSRF protection (not applicable until cookie-authenticated state-changing routes exist).
- Per-user/distributed rate limiting and abuse/spend controls; only a process-local concurrency guard is active.
- Provider retries and multi-provider fallback.
- Upload scanning, object-storage access controls, and isolated file-processing workers.
- Database migrations, conversation persistence, audit writes, and usage metering.

These gaps are release blockers for a public multi-user platform. Do not infer that the presence of schema tables means those controls are active.

## 7. Environment configuration

Server-only:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `DATABASE_URL` (optional until database-backed features are enabled)
- `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX`
- `APP_ORIGIN` (comma-separated trusted browser origins)

Public client build setting:
- `VITE_API_BASE_URL` (optional HTTPS API base URL; never put secrets here)

Render provides `PORT`. There is no Render Blueprint, Dockerfile, D1 binding, R2 binding, KV namespace, queue, or Worker deployment configuration checked into this repository.

## 8. Release posture

The current architecture is a modular monolith with a shared API edge, one service, and one provider adapter. It is not yet the full distributed/serverless architecture in the proposed diagram. Add services and infrastructure only alongside real implementations, configuration, monitoring, and authorization—not as empty integrations or UI promises.

No tests, type checks, builds, database migrations, workflow runs, or deployments were executed during this architecture source change.
