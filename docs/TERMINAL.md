# AFG AI Terminal

## Current experience

The main AFG AI app includes a responsive Terminal workspace that is available from the side navigation and from a floating launcher on every app screen after entering the app. Press **Ctrl+Shift+T** (or **Cmd+Shift+T** on macOS) to open it.

The terminal has:
- A local virtual workspace rooted at /home/user.
- File and directory commands, command history, search, keyboard history navigation and command completion.
- Local text-file upload and download.
- Multiple authenticated server sessions and an optional scoped CLI-token panel.
- Account-scoped AFG commands that read the user's own model catalog, conversations and file metadata.
- A bilingual Dari/English interface.

## Local workspace commands

The browser-only workspace supports:

- Navigation: **pwd**, **ls**, **cd**, **tree**
- Files: **mkdir**, **touch**, **cat**, **write**, **echo**, **rm**, **cp**, **mv**
- Search and inspection: **find**, **grep**, **wc**, **head**, **tail**, **stat**
- Utility: **download**, **whoami**, **hostname**, **uname**, **date**, **history**, **clear**, **version**, **help**
- Redirection: **echo "text" > file.txt** and **echo "more" >> file.txt**

The workspace is isolated to /home/user. It does not read or modify the web host filesystem. Files are stored in the current browser's local storage under the active account ID; they are not uploaded or synchronized to the server. The local workspace is also available in guest mode.

## Account commands

The following commands require an authenticated browser session and the Terminal API:

- **afg help**
- **afg version**
- **afg status**
- **afg account**
- **afg models list**
- **afg conv list**
- **afg files list**

Conversation and file results are restricted to the authenticated user. Server-side command submissions are written to the user's append-only terminal audit history.

## What is intentionally disabled

This release is a virtual workspace, **not a general-purpose Linux shell**. Commands such as **bash**, **sh**, **sudo**, **python**, **node**, **npm**, **git**, **curl**, **wget**, **ssh**, **apt**, and arbitrary executable files are not run. Pipes, command substitution and command chaining are rejected.

Do not set **TERMINAL_EXEC_ENABLED=true**. That environment variable does not enable execution. There is no production-grade isolated code runner attached yet. Enabling real Bash/Python/Node execution requires a separately deployed sandbox with per-user isolation, no access to application secrets or production databases, restricted network access, CPU/memory/process/disk quotas, hard timeouts, output limits, and audited lifecycle controls. The production API process must never execute user-supplied shell commands directly.

## CLI token management

A signed-in browser session can create a token with POST /api/terminal/tokens using a CSRF token and JSON body:

~~~json
{"name":"My laptop","scopes":["terminal.read"],"ttlDays":30}
~~~

The raw afg_cli_ token is returned once. Store it securely; the database stores only its SHA-256 hash. List with GET /api/terminal/tokens; revoke with DELETE /api/terminal/tokens/:id. Token creation/list/revocation is browser-session-only. CLI tokens cannot mint or revoke other tokens.

The only grantable scope is terminal.read. Admin scopes and terminal.exec are not granted by this endpoint.

## Sessions, rate limits and migrations

- POST /api/terminal/sessions creates a web session (or a CLI session when authenticated by a CLI token and surface=cli).
- GET /api/terminal/sessions lists only the caller's sessions.
- DELETE /api/terminal/sessions/:id revokes an owned session.
- GET /api/terminal/sessions/:id/history returns the caller's audit history.
- Each submitted account command is recorded with request ID, exit code and duration.
- CLI requests use the per-token hourly request bucket.

Database migrations: database/migrations/0004_terminal_foundation.sql, 0005_cli_token_rate_limits.sql, and 0006_terminal_audit_output.sql. These migrations must be applied to the production database before server-side Terminal sessions, audit history or CLI-token management can work. The local browser workspace does not depend on those tables.
