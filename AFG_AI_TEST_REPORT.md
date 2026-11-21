# AFG AI Test Report — 2026-11-22 (continuation run)

Environment: sandbox, Node v24.22.3, npm 11, no root, no Docker.
Database: user-space PostgreSQL 18 via `embedded-postgres` (now a declared
devDependency), fresh cluster per suite run — CI-equivalent semantics.

## Static and build gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run lint` (`tsc --noEmit`) | PASS |
| Production build | `npm run build` (incl. `prebuild` i18n check) | PASS (pre-existing >500 kB chunk warning only) |
| i18n parity | `npm run i18n:check` | PASS — 18 locales x 113 keys |

## DB-free regression suites

| Suite | Result |
|---|---|
| offline-sha | PASS |
| database-config | PASS |
| admin-rbac | PASS |
| osint | PASS |
| jarvis-command | PASS |
| core-state | PASS |
| chat-stream | PASS |
| knowledge | PASS |
| chat-persistence (logic) | PASS |
| image-adapter | PASS |

## PostgreSQL integration suites (canonical `scripts/run-integration-tests.sh`)

| Suite | Result | Coverage |
|---|---|---|
| conversation-isolation | PASS | ownership 404 isolation, CSRF (missing token 403), expired-session 401, persistence, cancelled status, idempotency (200 replay / 409 conflict), search scoping |
| chat-persistence-integration | PASS | Phase 3 server-side persistence: owner context, foreign-user null context, idempotent user turn, cancelled→complete upgrade, no-downgrade, history order, empty-reply guard |
| agent-engine | PASS | agent lifecycle, multi-step checkpointing, approval, replay protection, retry, interruption recovery, cancellation, CSRF, memory CRUD, user isolation |

Migrations: 57 files applied cleanly to both fresh clusters; second run of
`db:migrate` reports up-to-date (checksum-verified ledger).

## Runtime boot verification (`scripts/test-runtime-boot.sh`)

PASS — migration on start, production `tsx server.ts` boot, HTTPS 308 policy,
`X-Forwarded-Proto: https` health 200, static dist serving, CSP + HSTS headers.
Live log now prints `SUCCESS DATABASE_CONNECTED host=127.0.0.1` (truthful banner).

## Blocked / not runnable locally (by design)

| Item | Blocker | Where it does run |
|---|---|---|
| media-engine integration suite | ClamAV `clamscan` + signature DB not installable user-space in this sandbox (fail-closed 503 with exact setup message) | dedicated CI job with apt ClamAV |
| Provider live smoke tests (chat/image/voice against real APIs) | no NINEROUTER/APINEX/OPENAI_COMPAT credentials | production deployment with configured secrets |
| Android APK / Windows installer builds | require CI runner toolchains | existing GitHub workflows (android-apk, windows-desktop) |
| GitHub push | credentials unavailable per owner | manual push of the branch when credentials exist |

## Defects found and fixed in this run

1. `embedded-postgres` used by the repo's own verification scripts but not
   declared — fresh clones failed with MODULE_NOT_FOUND. Fixed (`6b125806`).
2. Misleading `SUCCESS SUPABASE_DATABASE_CONNECTED` banner on any provider.
   Fixed with a host-aware truthful log (`99115f70`).
3. Stale commit hashes in `CHANGELOG.md` after the `git am` lineage restore —
   corrected to the real hashes.

## Regression discipline

- Fresh disposable databases per suite run are mandatory: reusing a cluster
  accumulates login rate-limit rows and produces false 429 failures that do
  not occur in CI's fresh service container.
- No test was weakened, skipped or removed to obtain a passing result; the
  media-engine suite still hard-asserts a real scanner.
