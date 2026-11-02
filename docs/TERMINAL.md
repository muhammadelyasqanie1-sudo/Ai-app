# AFG AI Terminal — Phase 1

## Status

The API provides authenticated, owner-scoped Terminal sessions, scoped CLI tokens, a read-only native command surface and append-only command audit records. Shell execution is **disabled**. No shell, PTY, container, worker isolate or arbitrary process is started by the application.

## Available commands

Commands are sent to `POST /api/terminal/sessions/:id/commands` and are parsed server-side. The Phase 1 allowlist is intentionally limited to:

- `afg help`
- `afg version`
- `afg models list`
- `afg conv list` (only the signed-in user's conversations)
- `afg files list` (only the signed-in user's file metadata)

All other commands are rejected. In particular, `afg term`, shell syntax, pipes, redirects and arbitrary binaries are not supported. No command runs on the application host.

## CLI token management

A signed-in browser session can create a token with `POST /api/terminal/tokens` using a CSRF token and JSON body:

```json
{"name":"My laptop","scopes":["terminal.read"],"ttlDays":30}
```

The raw `afg_cli_` token is returned once. Store it securely; the database stores only its SHA-256 hash. List with `GET /api/terminal/tokens`; revoke with `DELETE /api/terminal/tokens/:id`. Token creation/list/revocation is browser-session-only. CLI tokens cannot mint or revoke other tokens.

The only currently grantable scope is `terminal.read`. Admin scopes and `terminal.exec` are not granted by this endpoint.

## Sessions and audit

- `POST /api/terminal/sessions` creates a web session (or a CLI session when authenticated by a CLI token and `surface=cli`).
- `GET /api/terminal/sessions` lists only the caller's sessions.
- `DELETE /api/terminal/sessions/:id` revokes an owned session.
- `GET /api/terminal/sessions/:id/history` returns the caller's audit history.
- Every submitted command is written to `terminal_audit` with request ID, exit code and duration.

Migration: `database/migrations/0004_terminal_foundation.sql`. Apply migrations only after a database backup and an explicit operator decision.

## Configuration and disabled execution

`TERMINAL_EXEC_ENABLED` defaults to `false`. Setting it to true does **not** enable execution in this release: a production-grade isolated sandbox adapter has not yet been implemented or configured. Do not enable it. The app deliberately rejects shell execution until a sandbox backend, resource limits, filesystem isolation, network denial, allowlist enforcement and admin control are implemented and reviewed.

`CLI_TOKEN_TTL_DAYS` controls the default token lifetime (maximum 90 days). `CLI_RATE_LIMIT_PER_HOUR` is reserved for the per-token hourly limiter; the dedicated limiter is not yet wired, so rely only on the existing global/IP/user rate limits for now.

## Remaining Phase 1 work

The standalone `afg` binary, CLI login/keyring/config handling, CLI chat streaming, web xterm-style UI, session tabs, search/keyboard UX, dedicated per-token hourly rate limiting and full localized UI are not implemented yet. The API foundation is not an acceptance-complete Terminal product.
