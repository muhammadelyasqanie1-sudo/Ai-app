# AFG AI — MASTER ENGINEERING MISSION — Durable Execution Checklist
> Living document. PR #166 (feature branch) is the umbrella delivery PR; independent
> workstreams get dedicated branches/PRs. Base: main @ 67aaeeab.
> NOTE: a sandbox rollback on 2026-11-23 wiped the first implementation pass; this pass
> was re-implemented and re-verified. Blueprints: tool-results/W1..W5_changes.md.

## Verified environment (2026-11-23)
- [x] Branch `feature/afg-ai-complete-product` @ c4ae4b71 base, clean, remote SHA match
- [x] main @ 67aaeeab (includes merged PRs #164, #165, #155)
- [x] PR #144 OPEN (c76d69c7), PR #152 OPEN (0eb9892b), PR #166 OPEN (c4ae4b71)
- [x] node v24, bun 1.3.14, ffmpeg+ffprobe present; gradle/docker/psql/clamscan MISSING

## Phase execution log
| Phase | Task | Status | Evidence |
| --- | --- | --- | --- |
| 2A-2E | Deep audits (arch/API/security/providers/DB) | DONE | tool-results/audit_2A..2E_*.md |
| 2B | Migrations 0054 (reported usage) + 0055 (hot-path indexes), test:migrations wired | DONE | npm run test:migrations PASS (65 files) |
| 2C/2E | Root repairs: admin overview contract, auth 503 classification, pepper HMAC, bootstrap-admin rate limit, connections superadmin, shared SSRF guard, announcements degraded, research available:false, reported usage parsing | DONE | commit 0039fb5a |
| 2C/2E/2D | web-next security: OAuth state, OTP caps, upload safety, SSRF guard, ADMIN-only role grants, cookie rename, same-origin, password 12, prod fail-fast, honest provider health (real probes) | DONE | commit a8adcaa9; 26/26 tests |
| CRITICAL | 9Router control-plane bridge bearer-token gate on ALL internal routes + regression suite | DONE | test:bridge-auth PASS |
| CI | ci.yml: npm ci, cache, permissions/concurrency, bridge-auth suite, web-next job (bun/lint/tsc/test/parity/build); deterministic fan-out test (process-group kill, port-free assert, boot-marker sync); runner provision retry; descriptor sweep cache+invalidation | DONE | fanout 3/3 PASS 0 orphans (pre-rollback verification; re-verified after redo) |
| 7 | PR #152 Windows offline runtime port → feat/windows-offline-ai | DONE (branch) | offlineDesktopRuntime.ts, electron IPC sandboxed preload, test:windows-runtime 92 checks PASS, live loopback smoke PASS |
| 8 | PR #144 cinematic selective integration → feat/cinematic-afg-integration | IN PROGRESS | partial (18 files), verification pending |
| 11 | i18n: root 18x113 enforced by i18n:check; web-next 4 locales parity script wired in CI | DONE | i18n:parity PASS |
| 12/13 | Android/Electron: no SDK/no Windows in env → static + CI-side verification documented | BLOCKED (documented) | W4 report |
| 14 | Deploy: server boot verified 2x per integration run (real instances), Dockerfile/render.yaml static | DONE (static) | integration logs |
| 16 | Full regression table | IN PROGRESS | see final report |

## Non-negotiables
No force-push/reset/branch deletion/history rewrite; SHA verified after every push.
No auto-merge into main. Honest provider health (no ACTIVE without real probe).
PASS/FAIL/NOT RUN/BLOCKED vocabulary only. Blockers documented, never an excuse.
