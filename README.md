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
- [GitHub collaboration guide](docs/engineering/GITHUB_COLLABORATION.md) — branch isolation, parallel-agent scope ownership, PR review, and current Actions behavior.
- [Coding-agent instructions](AGENTS.md) — repository-wide safety, implementation, and handoff rules.
- [Terminal status and command reference](docs/TERMINAL.md) — Phase 1 read-only browser workspace.
- [Online Admin Terminal Gateway](docs/ONLINE_ADMIN_TERMINAL.md) — server-side durable AI job queue and worker setup.
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
| `BEATAPI_API_KEY`, `BEATAPI_BASE_URL` | BeatAPI model provider and authenticated read-only catalog; default base URL is `https://api.beatapi.io` |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_PROVIDER_ID`, `OPENAI_COMPAT_DISPLAY_NAME` | Optional OpenAI-compatible provider |
| `NINEROUTER_BASE_URL`, `NINEROUTER_API_KEY` | Optional separate 9Router gateway; API key only when 9Router `requireApiKey` is enabled |
| `AFG_INTEGRATION_ENCRYPTION_KEY` | 32-byte server-side key for encrypting user API connector and remote MCP credentials |
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

- The gateway registers Cloudflare Workers AI, an optional OpenAI-compatible adapter, GPT-OSS proxy, BeatAPI when `BEATAPI_API_KEY` is configured, and 9Router when `NINEROUTER_BASE_URL` is configured. 9Router's API key is optional only when its own `requireApiKey` setting is disabled.
- A model is selectable only after live catalog discovery and a recent successful health check, and when the model is enabled and advertises streaming text capability.
- The gateway can fall back to another verified text model unless the request disables fallback.
- BeatAPI uses its OpenAI-compatible `/v1/chat/completions` text endpoint and `/v1/models` catalog. BeatAPI health verification is catalog-only so routine model discovery never sends a billable generation probe.
- Authenticated read-only integration routes expose `/api/beatapi/status`, `/api/beatapi/models`, `/api/beatapi/workflows`, `/api/beatapi/capabilities/search`, and `/api/beatapi/capabilities/inspect`. No capability-run route is exposed by this integration yet.
- A configured provider key alone is not evidence that a model or optional capability works.
- The currently implemented Cloudflare and OpenAI-compatible adapters declare chat/streaming only. Do not assume image, vision, OCR, voice, tools or video support from these adapters.
- Provider calls and secrets remain server-side.

## Universal API Hub, Public APIs and 9Router

- The **Universal API Hub** imports the API tables from the upstream [Public APIs repository](https://github.com/public-apis/public-apis) README, with the companion JSON directory as a fallback. It also imports the repository's MCP Servers table into the separate MCP directory.
- The catalog is metadata and discovery only. It does not blindly call documentation/homepage URLs. Create a server-side API connector with a verified endpoint, JSON Schema, authentication, and a successful connection test before enabling a third-party API as an AI tool.
- Public APIs listings do **not** contain provider API secrets. The connector vault accepts no-auth, Bearer tokens, custom API-key headers (including `X-Mashape-Key`) and API-key query parameters; OAuth authorization-code/token-refresh flows need dedicated adapters. Each user supplies credentials from the provider's official account.
- A user-linked GitHub OAuth account is available as a server-side chat tool for tool-capable models: list repositories/branches, inspect and search code, create a working branch, commit file changes to non-default branches, and open pull requests only when explicitly requested. Each user's OAuth token is encrypted at rest and scoped to that user's linked account; the model never receives the token. GitHub OAuth requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `APP_ORIGIN`, and `AFG_INTEGRATION_ENCRYPTION_KEY`. Only models whose live provider catalog advertises function/tool calling can use these tools.
- The **9Router AI Gateway** is a separately hosted service. AFG AI proxies its documented chat, model discovery, image, TTS, STT, embeddings, web search/fetch, video-job and response utility endpoints without exposing the upstream key in the browser.
- 9Router's RTK/Headroom token saving, Ponytail/Caveman prompt compression, multi-account rotation, quota tracking, token refresh, provider translation, combos, request logs and cloud sync remain managed by the 9Router dashboard. AFG AI links to that dashboard; it does not bypass provider limits or subscription terms.
- Admin navigation includes **Universal API Hub**, **MCP Tools & Servers**, and **9Router AI Gateway**. Remote MCP servers require owner consent and a successful secure handshake; STDIO execution remains disabled.
- Apply migrations 0012 through 0015 before using the API/MCP catalogs. Set `AFG_INTEGRATION_ENCRYPTION_KEY` before storing API or MCP credentials. See [Universal API Hub integration notes](docs/UNIVERSAL_API_HUB.md).

## Database

New installations should run `npm run db:migrate`. The migration runner applies each ordered SQL file transactionally and records checksums in `schema_migrations`. Never edit an already-applied migration; add a new numbered migration instead.

For existing installations that were bootstrapped with `database/schema.sql`, follow [database/MIGRATIONS.md](database/MIGRATIONS.md) and back up the database first.

## JARVIS Android device controls

The optional JARVIS screen provides user-confirmed Android app launching, navigation, visible-text clicking and focused-field text entry through the native Capacitor bridge. It requires the installed Android APK and the user to enable the AFG AI Jarvis Accessibility Service in Android Settings. It is not available in a browser. Offline voice, floating overlays, hand gestures and autonomous social actions are not implemented. Read [JARVIS Android setup and limitations](docs/JARVIS_ANDROID.md).

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


## JARVIS Android local device toolkit

The Android JARVIS bridge provides user-confirmed, on-device controls for battery status, vibration, flashlight, network status, last-known location, camera preview, contacts, recent SMS, sensor inventory, phone dialer and SMS composer. Sensitive data access is permission-gated and is not uploaded by the native plugin. Calls and SMS are handed to Android's system UI for the user to complete; they are never sent automatically. See [JARVIS Android documentation](docs/JARVIS_ANDROID.md) for platform and Google Play permission limitations.

The current multilingual offline command parser is deterministic phrase matching, not a bundled Needle model. The Cactus Needle runtime is a separate integration task requiring a verified Android engine/ABI and model asset.


## Recent integration status — 2026-11-06

The following implementation changes have been merged into `main`:

- **JARVIS Android device toolkit:** native Capacitor methods for battery, network transport, sensors, vibration, flashlight, cached location, contacts, recent SMS, camera capture, clipboard, dialer and SMS composer. Sensitive actions require Android permissions or explicit user interaction. Calling and sending SMS are completed by the user in Android system UI.
- **JARVIS language commands:** deterministic offline phrase matching includes English, Dari/Persian, Pashto and Arabic aliases. This is not a bundled generative Needle model, and speech recognition availability remains dependent on the Android device's speech service.
- **API key lifecycle:** migration `0034_api_key_lifecycle_usage_ledger.sql` adds active/waiting/expired/revoked state and owner-supplied expiry/renewal dates. Apply the migration explicitly before using the new fields; it has not been applied to a hosted database as part of this source change.
- **API usage view:** authenticated connector-run summaries report actual request totals, successes, failures and latency. Provider costs are not estimated when trustworthy provider cost data is unavailable.
- **Administration:** the legacy in-app admin UI has been removed; user and subscription administration is handled by the separate authenticated 9Router control plane.

**Release status:** these are merged source implementations, not a production-readiness claim. The web pull-request checks cover TypeScript, database configuration, admin RBAC, offline SHA-256 and the production web build. Native Android APK compilation and device permission/behavior checks require the separate manual Android workflow and a real Android device. Database migration 0034 must be reviewed and applied separately with a backup/recovery plan.
