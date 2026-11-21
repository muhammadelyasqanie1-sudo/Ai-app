# AFG AI Completion Report — 2026-11-22

Branch: `feature/afg-ai-complete-product` (local; push credentials unavailable).
Base: `main` @ `23c82be0`. Current tip: see `git log -1` (20 branch commits).

## Status vocabulary

- **Implemented** — code exists and is wired to the real backend.
- **Locally tested** — verified in this sandbox (build/tests/boot).
- **Integration tested** — verified against a real PostgreSQL / real HTTP flows.
- **Production verified** — verified on deployed infrastructure.
- **Blocked externally** — impossible here; exact missing requirement documented.

Nothing is labelled Production verified: no deployment target with real
credentials was available. No feature claims a live provider call without a
configured key.

## Core workflows

| Workflow | Status | Notes |
|---|---|---|
| Registration/login/session expiry/CSRF | Integration tested | conversation-isolation suite (real PG, real HTTP) |
| Conversation CRUD + ownership isolation | Integration tested | cross-user 404s, expired-session 401 verified |
| Server-side message persistence (both turns) | Integration tested | Phase 3 `997f9f9b`: idempotent user turn, cancelled→complete upgrade, no-downgrade, `persisted` SSE event |
| Streaming chat (SSE) | Locally tested | `chat-stream` suite; provider calls need keys, transport itself verified |
| Conversation search | Integration tested | suite covers `?search=` scoping |
| Model selection / discovery | Implemented | `/api/models` real discovery; capability gates; no fabricated availability |
| Provider health checks | Implemented | honest config-required state when keys absent; 9Router/Ollama architecture |
| Image generation/editing | Implemented | real adapter path `7da4a2de`; live calls need provider keys |
| Voice STT/TTS/vision | Implemented | real adapter endpoints `41dd10d9`; live calls need provider keys |
| File upload + security scan | Implemented (scan integration-tested in CI) | ClamAV fail-closed; precise setup message; CI job provisions real ClamAV |
| Admin console (users, flags, providers, models, audit, security events, health) | Locally tested | real `/api/admin/*`, server-side authorization enforced, admin-rbac suite PASS |
| Offline AI Hub (packs, checksums, downloads) | Locally tested | offline-sha/offline-download suites; on-device runtime claims remain gated |
| Agent runtime (multi-step, approvals, replay protection) | Integration tested | agent-engine suite PASS |
| OSINT engine | Locally tested | osint suite PASS |
| Production boot (migrations, HTTPS policy, health, static, CSP/HSTS) | Locally tested | `scripts/test-runtime-boot.sh` PASS on embedded PG 18 |

## Database

- 57 migrations apply cleanly to a fresh PostgreSQL 18 cluster (verified twice:
  sandbox testbed and the canonical `scripts/run-integration-tests.sh`).
- `schema_migrations` ledger policy, duplicate-number guard and the live
  `9999_settings_hub` documented (`00c8e748`).
- Real database operations verified — connectivity is never claimed from
  environment variables alone.

## Security posture

- Rate-limit regex enforcement fixed (`7dc6ab76`); login throttling verified to
  persist in DB (observed as 429 on rate-limited replay — correct fail-closed).
- Ownership + CSRF + session expiry enforced server-side and integration-tested.
- Truthful logging: DB banner no longer claims "Supabase" on foreign providers
  (`99115f70`); no secrets in logs (host-only banner).
- File uploads quarantine unless a real ClamAV scan approves them.

## External blockers (exact requirements)

1. **GitHub push** — credentials unavailable; all work committed locally and
   packaged as patches/zip in the delivery folder.
2. **Provider keys** — NINEROUTER / APINEX / OPENAI_COMPAT / image+voice models:
   without keys the UI/API honestly report configuration-required.
3. **ClamAV** — needed for local media-engine suite; sandbox cannot install it
   user-space; CI job covers it.
4. **Android/Windows packaging verification** — requires CI runners (workflows
   exist and are wired).

## Continuity

`AFG_AI_MASTER_PLAN.md` carries the phase board and the ranked remaining work
(deep i18n for 14 locales, multi-instance WebSocket fan-out, vendor pruning,
provider smoke tests). Any future session resumes from those two documents plus
`CHANGELOG.md`.
