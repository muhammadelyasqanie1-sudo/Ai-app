# AFG AI Master Plan — repository completion (2026-11-22)

Mission: complete the existing AFG AI Vite application into a production-ready
AI platform on `feature/afg-ai-complete-product`, without rewriting the
framework, without parallel applications, and without faking any state.

## Architecture lock (invariants)

- Single application: Vite + React at the repo root, Node API (`server.ts`),
  PostgreSQL. No framework switch, no parallel port (an off-mission Next.js
  port commit was removed from the branch and preserved as a patch).
- Providers: 9Router and Ollama as the preferred architecture, OpenAI-compatible
  providers through the configurable adapter. No Gemini default, no Iteracompute,
  no hardcoded credentials.
- All authorization server-side; guests stateless by design.
- Every capability that needs external configuration gates honestly
  ("configuration required") instead of pretending success.

## Phase status board (mission phases 1-14)

| # | Phase | State | Evidence |
|---|---|---|---|
| 1 | Repository inspection & baseline | Complete | audit commit `5c27f7de`; baseline re-verified this run |
| 2 | Core architecture, backend, database | Complete (locally verified) | 57 migrations applied on fresh PG 18 twice; migration ledger guard `00c8e748`; P0 backend fixes `7dc6ab76` |
| 3 | Auth, users, sessions, persistence | Complete (integration tested) | conversation-isolation + chat-persistence-integration suites PASS |
| 4 | Chat engine, streaming, history, model switching | Complete (integration tested) | server-side assistant persistence `997f9f9b`; `chat-stream`, `chat-persistence` suites PASS |
| 5 | Providers, models, API integrations | Implemented (smoke tests need provider keys) | keep-only-9router-and-ollama migration; model discovery + health; image adapter `7da4a2de`; honest config-required gates |
| 6 | Admin dashboard & permissions | Complete (locally tested) | `AfgAdminConsole` on real `/api/admin/*`, server-side authorization, admin-rbac suite PASS |
| 7 | Search, tools, MCP, GitHub integrations | Implemented (existing backend verified) | osint suite PASS; browser tool abort fix; MCP/connections backend pre-existing |
| 8 | Voice, images, documents, Media Studio | Implemented (needs provider keys for live media) | real STT/TTS/vision `41dd10d9`; real generateImage/editImage `7da4a2de`; ClamAV-gated uploads fail-closed |
| 9 | Offline AI Hub | Implemented (device runtime claims gated) | offline pack registry, Needle/Vosk/GGUF plugins; offline-sha/offline-download suites PASS |
| 10 | Mobile, desktop, RTL, multilingual | Implemented (packaging verified in CI) | Capacitor plugins + workflows; Electron/Windows CI; 18 locales x 113 keys parity-checked; RTL |
| 11 | Button-by-button verification | Partially complete | audit-driven fixes (dead paths, broken buttons); full matrix to be regenerated after each new surface |
| 12 | Security & regression testing | Substantially complete | rate-limit enforcement fix; CSRF/idempotency/expiry suites; CSP/HSTS verified in boot test; ClamAV fail-closed |
| 13 | Production build & deployment readiness | Complete (locally verified) | Dockerfile + Render Blueprint `bf36fd2c`; runtime boot verification PASS |
| 14 | GitHub delivery | Local commits only — push blocked externally | push credentials unavailable per owner; delivery package maintained |

## Remaining work (ranked, from the completion plan)

1. ~~Secondary-locale i18n~~ — **Complete.** All 13 secondary locales now
   carry full native translations (908 English copies replaced); the
   `i18n:check` gate hard-fails on any untranslated English copy
   (documented loanword whitelist only).
2. ~~Multi-instance WebSocket/queue fan-out~~ — **Complete.** Cross-instance
   live event fan-out over PostgreSQL LISTEN/NOTIFY
   (`src/services/liveEventHub.ts`), wired into `/api/events` and every
   catalog/health mutation; verified by
   `scripts/test-multi-instance-fanout.ts` (two real instances, one cluster).
3. ~~`vendor/OpenJarvis` pruning decision~~ — **Decided and executed.**
   Evidence-based: no runtime, build, test, or workflow reference imports
   `vendor/OpenJarvis` (the three OpenJarvis proxy routes talk to the runtime
   over HTTP via `OPENJARVIS_INTERNAL_URL`, not to the snapshot); tsconfig
   already excluded it. 2203 files / ~107 MB untracked (commit `0e7109a9`),
   restorable on demand via the `import-openjarvis` workflow.
4. ~~Provider smoke tests~~ — **Complete (simulated upstreams).**
   `scripts/test-provider-smoke.ts` exercises the real 9Router/Ollama/
   OpenAI-compatible adapters including honest failure paths. Live smoke
   tests with real NINEROUTER/APINEX/OPENAI_COMPAT keys remain blocked by
   external credentials (documented, not fabricated).
5. ~~Media-engine local suite~~ — **Addressed.** Reproducible local ClamAV
   setup (`scripts/setup-clamav.sh`, `scripts/check-clamav.ts`,
   `docs/CLAMAV_SETUP.md`); the integration suite itself runs in the CI
   media-engine job (sandbox has no root for apt — documented).

## Execution protocol

Every session: restore state from this branch, run the quality gates
(`lint`, `build`, `i18n:check`, DB-free suites, canonical integration scripts),
continue the highest-ranked remaining item with the DISCOVER-DESIGN-IMPLEMENT-
TEST-VERIFY-DOCUMENT-COMMIT loop, and update `CHANGELOG.md` +
`AFG_AI_COMPLETION_REPORT.md` + `AFG_AI_TEST_REPORT.md` before finishing.
