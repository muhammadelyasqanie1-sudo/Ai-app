<!-- coderabbit-ai-generated:v1 -->

# AFG AI — Phase 1 reliability delivery

## Scope and architecture
Continues the existing feature branch and incorporates the earlier uncommitted command center. React/Vite remains the client, Express and `src/api/http.ts` remain the API edge, PostgreSQL remains account storage, and the existing provider gateway, authentication, agent/tool loop, research/browser services, WebLLM hub and Android bridge remain in place. No provider credentials or production configuration changed.

## Implemented and verified
- PostgreSQL pool URL validation, bounded pool size, connection/query/statement timeouts, redacted idle-pool errors.
- Readiness additionally checks the migration ledger against source SHA-256 checksums. Database connectivity alone no longer declares the app ready with missing or changed migrations.
- Migration runner serializes concurrent runs with a PostgreSQL advisory lock and supports `--status`. It preserves checksum verification and per-file transactions.
- Migration `0048_cancelled_message_status.sql` permits cancelled messages and adds a stable message-order index without deleting data.
- Conversation listing supports bounded `limit`, `offset`, and literal title `search`, returning `nextOffset`. Message inserts recheck owner under a transaction lock.
- A shared SSE decoder handles fragmented UTF-8, CRLF, heartbeat comments, aborts, malformed events and event-size limits. It rejects EOF without a terminal event, preventing partial output from being marked complete.
- Fresh disposable PostgreSQL 16: all migrations applied, a second run skipped applied files. Real API integration tests passed for ownership denial, unauthorized requests, CSRF, expired sessions, persistence, duplicate-message idempotency/conflicts, cancellation status, pagination validation and search.
- Password login with Argon2 hashes and invalid-password rejection passed against synthetic verified accounts; HttpOnly session cookie issuance checked. Synthetic users were removed after tests.

## Implemented but not externally verified
- Chat requires successful account message persistence before sending inference. Assistant save errors become visible instead of console-only warnings.
- Cancelled partial responses remain visible and persist as cancelled. Account changes abort the active request. New conversation requests during generation first cancel the current request.
- Explicit model selection survives catalog refresh/outages. Manual chat requests disable fallback; automatic selection remains available.
- Task storage is separated by stable account ID; shell remounts on account changes. Existing guest data stays in its original namespace without automatic account import. Namespace reads are regression-tested; full browser account-switch flow is not yet exercised.

## Remaining classification
| Feature | Classification | Remaining work |
| --- | --- | --- |
| Genuine provider generation and streaming | Blocked by missing configuration | Configure a live 9Router/APInex or supported local inference endpoint; no inference response was fabricated. |
| Authenticated refresh recovery | Partially implemented | Existing persisted messages load, but assistant persistence is still initiated by the browser. Refresh during generation cannot guarantee durable partial output. Move request lifecycle/persistence into the backend before calling this production-ready. |
| Registration/email verification/logout | Implemented but not externally verified | Existing routes retained; this turn tested password login and session expiry, not email delivery or the complete registration/logout UI. |
| Agent and browser execution | Partially implemented | Existing bounded tool loop and research/browser code retained; no new durable agent runtime or approval-token service delivered. |
| Files and memory | Partially implemented | Existing owner-scoped APIs and local file preview retained; no extraction/scanner or new memory retrieval engine added. |
| Tasks synchronization/encryption | Not implemented | Account namespaces prevent accidental shared-list display but are not a server authorization boundary. Server synchronization, conflict handling and encryption remain required. |
| Offline inference | Implemented but not externally verified | Existing runtimes retained; no model downloaded or loaded. |
| Complete five-language UI | Partially implemented | Navigation localized; body-copy localization remains outstanding. |
| Native and cross-device behavior | Implemented but not externally verified | Existing Capacitor bridge retained; no physical-device or sync workflow verification. |

## Migration and configuration instructions
Back up the target database and review migrations before applying them. No production migrations were run.

```sh
npm run db:migrate -- --status
npm run db:migrate
npm run lint
npm run build
npx tsx scripts/test-chat-stream.ts
npx tsx scripts/test-jarvis-task-storage.ts
```

`--status` acquires the migration lock, ensures the ledger exists and reports pending files; it does not apply migration SQL. Never edit applied migrations. Migration 0048 must be applied before cancelled messages can persist.

Existing environment names: `DATABASE_URL` (PostgreSQL connection), `DATABASE_POOL_MAX` (1–100 connections, defaults to 5 for invalid values), `DATABASE_SSL`, `DATABASE_SSL_CA`, `DATABASE_SSL_REJECT_UNAUTHORIZED` (TLS policy), `APP_ORIGIN` (canonical HTTPS origin), `NINEROUTER_BASE_URL` and `NINEROUTER_API_KEY` (gateway), `OLLAMA_BASE_URL` (backend-local inference), `AFG_INTEGRATION_ENCRYPTION_KEY` (connector vault), `RESEND_API_KEY` and `EMAIL_FROM` (verification email). Use the existing `.env.example` for the remaining integrations; never expose secrets in Vite variables. No new secret variable was introduced.

The isolation test deliberately refuses all database hosts except loopback port 55432. It creates/removes synthetic users; run only against a disposable migrated test database. The sandbox instance is a PostgreSQL 16 container accessed through the task-local Docker socket `/tmp/jarvis-docker.sock`. It is not the hosted application database.

## Verification and limitations
Fresh TypeScript, build, database TLS, admin RBAC, offline SHA-256, JARVIS parser, task-storage, SSE, and PostgreSQL integration checks passed. Browser smoke opened the existing preview and checked 390px navigation; prior detailed layout/accessibility results are reused for the unchanged design. Existing CSS/config-loader/bundle warnings remain. No production deploy, push, merge, model download or native build occurred.

The next implementation stage is server-owned chat request persistence with resumable status, followed by a genuine configured-provider sign-in/send/refresh end-to-end test. Later agent, synchronization and localization stages are still required. This delivery does not satisfy the entire ten-stage specification.
