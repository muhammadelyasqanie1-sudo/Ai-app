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

1. Secondary-locale i18n — measured: each of the 14 non-primary locales still
   carries 40-43 of 113 keys as English copies; the four primary mission
   languages (en, dari, pashto, persian) plus arabic are fully translated
   (persian completed this run, commit `c3744eb8`).
2. Multi-instance WebSocket/queue fan-out (3-5 days) — single-instance live state today.
3. `vendor/OpenJarvis` pruning decision (83% of tracked files; three live proxy routes depend on it).
4. Provider smoke tests with real NINEROUTER/APINEX/OPENAI_COMPAT keys.
5. Media-engine integration suite locally (needs ClamAV; runs in CI job today).

## Execution protocol

Every session: restore state from this branch, run the quality gates
(`lint`, `build`, `i18n:check`, DB-free suites, canonical integration scripts),
continue the highest-ranked remaining item with the DISCOVER-DESIGN-IMPLEMENT-
TEST-VERIFY-DOCUMENT-COMMIT loop, and update `CHANGELOG.md` +
`AFG_AI_COMPLETION_REPORT.md` + `AFG_AI_TEST_REPORT.md` before finishing.
