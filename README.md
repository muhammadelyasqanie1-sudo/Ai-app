# AFG AI

**AFG AI — One AI. Many capabilities. One intelligent platform.**

AFG AI is an Android-friendly and web-based AI assistant. The current repository contains a React/Vite client, an Express API, PostgreSQL persistence, a server-side provider gateway, and a Capacitor Android wrapper.

> **Project status:** Active development. Signed-in chat now attempts to persist user/assistant messages through the authenticated conversation API, and History loads server conversations. This integration has not been runtime-verified and still has known recovery, idempotency, legacy-history migration and localization gaps. Read [the Phase 1 gap analysis](docs/GAP_ANALYSIS_PHASE1.md) and [delivery plan](docs/DELIVERY_PLAN.md) before treating any capability as production-ready.

## Repository layout

- `src/` — React UI, API routes, provider adapters, security helpers and shared services.
- `packages/shared/` — shared Zod request schemas and canonical model IDs.
- `packages/providers/`, `packages/i18n/`, `packages/ui/` — compatibility entry points for existing implementations.
- `database/migrations/` — ordered PostgreSQL migrations (the clean-install source of truth).
- `database/schema.sql` — legacy bootstrap/reference schema; new installations should use migrations.
- `docs/` — architecture, security, reliability, acceptance criteria and delivery/reporting rules.
- [Terminal status and command reference](docs/TERMINAL.md) — Phase 1 read-only Terminal API.
- [AFG CLI guide](apps/cli/README.md) — supported Node.js CLI commands and secure token setup.
- [Offline Learning status](docs/OFFLINE.md) — current disabled state and implementation prerequisites.
- [Terminal + Offline gap analysis](docs/TERMINAL_OFFLINE_GAP_ANALYSIS.md) — what exists and what remains.
- `.github/workflows/android-apk.yml` — manually triggered debug APK build.

There is currently no checked-in Render Blueprint, Dockerfile or general deployment manifest. Configure the production API and static client using the hosting provider's dashboard and the instructions below.

## Requirements

- Node.js 22 or later (the Android workflow currently uses Node.js 22).
- PostgreSQL 15 or later for accounts, conversation history, admin controls, preferences and database-backed rate limits.
- Java 21 and Android SDK only when building the native Android wrapper.
- At least one supported server-side AI provider configured for chat.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and configure the required database and at least one provider. Never expose provider credentials in `VITE_*` variables or commit `.env`.

3. Apply the ordered database migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the Vite development server (API routes are mounted by the Vite middleware):

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

For a production-style local server, build the client and then start Express:

```bash
npm run build
npm run start
```

The server serves the generated `dist/` directory and routes `/api/*` through the same API handler.

## Server configuration

See [.env.example](.env.example) for the complete variable list. Main groups:

| Variables | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX` | PostgreSQL connection and pool settings |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI provider |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_PROVIDER_ID`, `OPENAI_COMPAT_DISPLAY_NAME` | Optional OpenAI-compatible provider |
| `APP_ORIGIN` | Canonical HTTPS origin and trusted browser origins |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth |
| `RESEND_API_KEY`, `EMAIL_FROM`, `AFG_EMAIL_CODE_PEPPER` | Email verification and password-reset delivery/code hashing |
| `AFG_ADMIN_BOOTSTRAP_TOKEN` | One-time initial admin bootstrap secret |
| `TAVILY_API_KEY` | Optional research search integration |
| `AFG_UPLOAD_QUARANTINE_DIR` | Private upload quarantine path; upload processing remains disabled until the full pipeline exists |
| `TERMINAL_EXEC_ENABLED`, `TERMINAL_SANDBOX`, `TERMINAL_ALLOWLIST`, `TERMINAL_TIMEOUT_SECONDS`, `TERMINAL_MAX_OUTPUT_BYTES` | Terminal execution controls; shell execution is not implemented and must remain disabled |
| `CLI_TOKEN_TTL_DAYS`, `CLI_RATE_LIMIT_PER_HOUR` | CLI token lifetime and atomic per-token hourly request limit |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_PULL_ON_INSTALL`, `PACK_SIGNING_PUBKEY`, `PACK_MIRROR_URL`, `OFFLINE_SYNC_DEFAULT` | Reserved Offline Learning configuration; local verification/storage foundations exist, but no model runtime or pack catalog is connected |
| `AFG_UNKNOWN_CONTEXT_BUDGET` | Conservative context budget for models without context metadata |
| `VITE_API_BASE_URL` | Optional public API base for a separately hosted native APK; never put secrets here |

Cloudflare credentials are obtained from the Cloudflare dashboard/API Tokens with the account permissions required for Workers AI. OpenAI-compatible credentials and base URL are obtained from the selected provider. Google OAuth credentials are created in Google Cloud Console and must use the exact callback URL `https://YOUR_APP_ORIGIN/api/auth/google/callback`. Resend credentials and a verified sender address are managed in the Resend dashboard. Configure these values only in the server host's secret/environment settings.

## Provider behavior

- The gateway currently registers Cloudflare Workers AI and an optional OpenAI-compatible adapter.
- A model is selectable only after live catalog discovery and a recent successful health check, and when the model is enabled and advertises streaming text capability.
- The gateway can fall back to another verified text model unless the request disables fallback.
- A configured provider key alone is not evidence that a model or optional capability works.
- The currently implemented Cloudflare and OpenAI-compatible adapters declare chat/streaming only. Do not assume image, vision, OCR, voice, tools or video support from these adapters.
- Provider calls and secrets remain server-side.

## Database

New installations should run `npm run db:migrate`. The migration runner applies each ordered SQL file transactionally and records checksums in `schema_migrations`. Never edit an already-applied migration; add a new numbered migration instead.

For existing installations that were bootstrapped with `database/schema.sql`, follow [database/MIGRATIONS.md](database/MIGRATIONS.md) and back up the database first.

## Android APK

The Android wrapper uses Capacitor with app ID `com.afgai.app`. To build a debug APK using GitHub Actions:

1. Open **Actions → Build Android APK**.
2. Run the workflow on `main`.
3. Optionally supply the deployed HTTPS API base URL as the workflow input.
4. Download the `AFG-AI-Android-APK` artifact.

See [ANDROID_BUILD.md](ANDROID_BUILD.md). Building an APK does not deploy the backend. A native APK needs a reachable HTTPS API URL; configure it at build time using the workflow input.

## Quality and delivery rules

- Run tests, builds, migrations and deployments only when the project owner explicitly requests them.
- Do not add mock provider responses, fake model availability or simulated success.
- Keep unsupported capabilities disabled and explain why.
- A feature is complete only if it satisfies all ten checks in [docs/ACCEPTANCE_CRITERIA.md](docs/ACCEPTANCE_CRITERIA.md).
- Every implementation task ends with [docs/FINAL_REPORT_FORMAT.md](docs/FINAL_REPORT_FORMAT.md).
- See [docs/GAP_ANALYSIS_PHASE1.md](docs/GAP_ANALYSIS_PHASE1.md) for current known gaps.
