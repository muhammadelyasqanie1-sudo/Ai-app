# AFG AI Test Report — 2026-11-22 (continuation session 2)

Environment: sandbox, Node v24.22.3, npm 11, no root, no Docker.
Database: user-space PostgreSQL 18 via `embedded-postgres` (declared
devDependency), fresh cluster per battery run — CI-equivalent semantics.

## Static and build gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run lint` (`tsc --noEmit`) | PASS |
| Production build | `npm run build` (incl. `prebuild` i18n check) | PASS (pre-existing >500 kB chunk warning only) |
| i18n parity + no-English-copy gate | `npm run i18n:check` | PASS — 18 locales × 113 keys, **0 untranslated** (was 908) |
| Per-locale measurement | `npx tsx scripts/i18n-untranslated.ts` | 0 English copies in all 17 non-English locales |

## DB-free regression suites (11/11 PASS)

| Suite | Result |
|---|---|
| offline-sha | PASS |
| offline-download | PASS |
| osint | PASS |
| database-config (TLS policy) | PASS |
| admin-rbac | PASS |
| jarvis-command | PASS |
| core-state | PASS |
| chat-stream | PASS |
| chat-persistence (logic) | PASS |
| image-adapter | PASS |
| **provider-smoke (new)** | PASS |

## PostgreSQL integration suites (canonical `scripts/run-integration-tests.sh`)

Fresh PG 18 cluster per battery run; 57 migrations applied cleanly.

| Suite | Result | Coverage |
|---|---|---|
| conversation-isolation | PASS | ownership 404 isolation, CSRF (missing token 403), expired-session 401, persistence, cancelled status, idempotency (200 replay / 409 conflict), search scoping |
| chat-persistence-integration | PASS | server-side persistence: owner context, foreign-user null context, idempotent user turn, cancelled→complete upgrade, no-downgrade, history order, empty-reply guard |
| agent-engine | PASS | lifecycle, multi-step checkpointing, approval, replay protection, retry, interruption recovery, cancellation, CSRF, memory CRUD, user isolation |
| **multi-instance-fanout (new)** | PASS | two real `tsx server.ts` instances on one cluster: initial snapshot on both, admin mutation on instance A pushed to BOTH subscribed clients via LISTEN/NOTIFY (asserted on persistent connections so the initial snapshot cannot satisfy the check), reconnect snapshot, guest authorization (valid snapshot + 401 mutation), non-admin 403 |
| **provider-smoke DB section (new)** | PASS | 9Router handler: unauthenticated 401, config-required 503 naming NINEROUTER_BASE_URL, SSRF rejection of `http://127.0.0.1` and `https://127.0.0.1` targets |

## Runtime boot verification (`scripts/test-runtime-boot.sh`)

PASS — migration on start, production `tsx server.ts` boot, HTTPS 308 policy,
`X-Forwarded-Proto: https` health 200, static dist serving, CSP + HSTS headers.

## Provider smoke details (`scripts/test-provider-smoke.ts`, DB-free section)

| Check | Result |
|---|---|
| Unconfigured OpenAI-compat → honest 503 `provider_not_configured` + config message | PASS |
| Real adapter vs mock gateway: paginated discovery (`has_more` cursor), inference-probe health, unknown model honest false, SSE reassembly "Hello from mock" | PASS |
| Rejected credentials → 401 `model_catalog_failed`, health honest false | PASS |
| Ollama loopback guard (https remote rejected) | PASS |
| Ollama discovery (disabled-until-verified), probe health, ndjson reassembly | PASS |
| Ollama daemon stopped → 502 `provider_unreachable`, health honest false | PASS |

## Button-by-button verification (Phase 11 re-run)

- Automated dead-handler sweep over every `.tsx/.ts` component:
  all `<button>` blocks checked for click/submit/disable semantics —
  2 candidates flagged, both verified as `<form type="submit">` handlers
  (AfgHomeView quick-ask, JarvisShell add-task). **0 dead buttons.**
- Real fixes shipped where UI contradicted backend: file-tools panel now runs
  the real upload/list/scan flows (`92961043`); pdf-tools copy made truthful
  (TXT/MD/CSV/JSON works, PDF/Office honestly not implemented) in 4 locales.

## Blocked / not runnable locally (by design)

| Item | Blocker | Where it does run |
|---|---|---|
| media-engine integration suite | ClamAV `clamscan` + signature DB not installable user-space in this sandbox (fail-closed with exact setup message) | dedicated CI job with apt ClamAV; local setup now reproducible via `scripts/setup-clamav.sh` |
| Provider live smoke tests (chat/image/voice against real APIs) | no NINEROUTER/APINEX/OPENAI_COMPAT credentials | production deployment with configured secrets |
| Android APK / Windows installer builds | require CI runner toolchains | existing GitHub workflows (android-apk, windows-desktop) |
| **GitHub push** | no credentials: `fatal: could not read Username for 'https://github.com'`; no gh CLI / token / credential store | manual push when credentials exist (steps in AFG_AI_COMPLETION_REPORT.md) |

## Defects found and fixed in this session

1. 908 English-copy translation keys across 13 locales → fully translated,
   gate added so the class of defect cannot silently return (`4c11d75e`).
2. Single-instance live state only → cross-instance LISTEN/NOTIFY fan-out with
   reconnect and auth coverage (`7ffcaa8f`).
3. File-tools panel read nonexistent API fields (`available`,
   `plannedFormats`) and permanently claimed uploads were disabled → consumes
   the real contract and implements upload/list/scan flows (`92961043`).
4. pdf-tools panel contradicted its own working file input ("not enabled yet"
   above a functioning TXT/MD/CSV/JSON summarizer) → truthful copy in 4 locales.

## Regression discipline

- Fresh disposable databases per suite run remain mandatory (login rate-limit
  rows otherwise produce false 429s).
- No test was weakened, skipped or removed to obtain a passing result; the
  media-engine suite still hard-asserts a real scanner; the fan-out suite
  asserts cross-instance delivery on connections that already consumed their
  initial snapshot, so a passive "initial snapshot" cannot fake a pass.
