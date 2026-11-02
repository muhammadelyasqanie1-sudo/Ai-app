# Terminal + Offline Learning — repository gap analysis

Audited against the current main tree and source files. Code inspection only; no tests, builds, migrations or deployments were run.

| Area | Existing | Missing / incomplete | Status |
|---|---|---|---|
| React/Vite, Express, PostgreSQL | Root app, API router, database pool, migrations | Physical workspace split remains a facade | Existing |
| Auth / CSRF | Cookie sessions, authenticated user lookup, CSRF | CLI token path not runtime verified | Existing + partial |
| Terminal UI | New Terminal tab and basic read-only page | xterm, tabs, scrollback search, keyboard history, completion, audit drawer | Partial |
| CLI tokens | SHA-256 hashes, prefix, scopes, expiry, last-used, revoke | Per-token hourly limiter and CLI config/keyring | Partial |
| Terminal API | Sessions and read-only commands: help, version, models list, conv list, files list | Full command matrix, streaming, uploads, image, admin, search/export/rename/pin | Partial |
| Terminal audit | Request ID, command, exit code, duration; immutable event content | Runtime verification and retention policy | Partial |
| Shell execution | Explicitly disabled | Isolated sandbox, allowlist executor, timeout/output caps, admin opt-in | Missing; correctly disabled |
| Offline Learning | Navigation and explicit unavailable notice | Tutor, lessons, quizzes, flashcards, progress, pack manager | Disabled / missing |
| Ollama | Environment placeholders | Local adapter and tags/show/chat/pull integration | Missing |
| Signed packs | None | Manifest, Ed25519 verification, SHA-256, key rotation, mirror/catalog, resumable install | Missing |
| Browser offline | None | WebLLM/WASM, IndexedDB/OPFS, service worker, network isolation | Missing |
| Desktop runtime | Capacitor Android wrapper | Tauri/Electron desktop and localhost-only Ollama bridge | Missing |
| Learning data/sync | None | Local progress and opt-in cloud sync/export | Missing |
| Guardrails | Specification only | Education-only refusal, exact guardrail, citations, uncertainty | Missing |
| Languages | English and Dari in current app | Pashto/Arabic and full terminal/offline localization | Partial |
| Deployment | Root Express/Vite; env example; no checked-in Render Blueprint, Dockerfile or Wrangler config | Sandbox and pack mirror deployment | Partial |

## Phase 1 implementation added

- `database/migrations/0004_terminal_foundation.sql`: CLI token, terminal session and append-only audit tables.
- `src/api/terminal.ts`: token issue/list/revoke, session lifecycle, owner-scoped read-only commands and audit insertion.
- `src/api/http.ts`: mounts the Terminal API.
- `src/components/afg/AfgTerminalView.tsx`, `AfgNavigation.tsx`, `src/types/afg.ts`, `src/App.tsx`: Terminal view and explicit Offline Learning unavailable screen.
- `docs/TERMINAL.md`, `docs/OFFLINE.md`, `docs/DEPLOYMENT.md`, `.env.example`: setup and limitations.

## Production gaps

1. The standalone `afg` CLI does not exist yet; this API is not a complete CLI.
2. Token hourly throttling is not wired; existing global/IP/user limits are the only current protection.
3. Terminal xterm UX, tabs, search, completion and audit drawer are absent.
4. Shell execution must remain off. Setting `TERMINAL_EXEC_ENABLED=true` does not enable it safely.
5. Offline Learning is not implemented: no Ollama, WebLLM/WASM, signed packs, lessons or offline progress.
6. Migration is not applied and new routes/UI are not runtime verified.
