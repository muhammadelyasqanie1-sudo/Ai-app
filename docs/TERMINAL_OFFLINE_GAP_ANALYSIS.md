# Terminal + Offline Learning — repository gap analysis

Audited against the current main tree and source files. Code inspection only; no tests, builds, migrations or deployments were run.

| Area | Existing | Missing / incomplete | Status |
|---|---|---|---|
| React/Vite, Express, PostgreSQL | Root app, API router, database pool, migrations | Physical workspace split remains a facade | Existing |
| Auth / CSRF | Cookie sessions, authenticated user lookup, CSRF | CLI token path not runtime verified | Existing + partial |
| Terminal UI | Terminal tab, session list, persisted command/output scrollback, search, arrow-key history, token create/revoke panel | xterm.js, terminal tabs, tab completion, audit drawer polish | Partial |
| CLI tokens | SHA-256 hashes, prefix, scopes, expiry, last-used, revoke; hourly bucket limiter | OS keyring and compiled binary | Partial |
| Terminal API | Sessions, whoami, read-only commands, request IDs, bounded output audit | Full command matrix, chat streaming, uploads, image, admin, search/export/rename/pin | Partial |
| Terminal audit | Request ID, command, exit code, duration; immutable event content | Runtime verification and retention policy | Partial |
| Shell execution | Explicitly disabled | Isolated sandbox, allowlist executor, timeout/output caps, admin opt-in | Missing; correctly disabled |
| Offline Learning | Navigation, explicit unavailable notice, manifest schema, Node/WebCrypto Ed25519 + SHA-256 verification modules, IndexedDB local pack/lesson/progress/quiz/session store, education-only first-pass policy | Signed catalog, downloader/resume, actual model runtime, tutor UI, curated packs, semantic/output guardrails, health check | Foundation only / disabled |
| Ollama | Environment placeholders | Desktop-local adapter and tags/show/chat/pull integration | Missing |
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

1. A Node.js CLI exists for login, logout, whoami, models list, conv list and files list; it is not a compiled single binary, has no OS keyring, and does not implement the full command matrix.
2. Per-token hourly rate buckets are implemented in code but require migration `0005_cli_token_rate_limits.sql` to be applied.
3. Terminal UI has sessions, persisted scrollback, search, arrow-key command history and token controls; xterm.js, multi-tab terminal emulation, tab completion and a dedicated audit drawer remain absent.
4. Shell execution must remain off. Setting `TERMINAL_EXEC_ENABLED=true` does not enable it safely.
5. Offline foundations now include signed manifest verification, local IndexedDB pack/lesson/progress/quiz/session storage and a conservative educational pre-filter; no catalog, downloads, model runtime, curated pack, tutor screen or Ollama integration exists.
6. Migrations `0004`–`0007` are not applied; new routes, CLI and browser storage modules are not runtime verified.
