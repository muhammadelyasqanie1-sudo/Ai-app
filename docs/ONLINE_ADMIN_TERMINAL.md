# AFG AI Online Admin Terminal Gateway

## What this service is

The Online Admin Terminal Gateway is a server-side background worker and a durable PostgreSQL job queue. It is designed to remain online independently of the administrator's phone. It processes administrator-submitted AI jobs through AFG AI's existing, health-verified provider gateway and returns their results to the authenticated admin API.

It is **not** a Linux shell, remote desktop, browser-cookie reader, or mechanism for converting a consumer ChatGPT subscription into API access. It never executes user-supplied shell commands. Provider credentials remain server-side and must be configured through supported provider integrations.

## Runtime topology

- AFG AI API: accepts admin-only jobs and stores them in PostgreSQL.
- A separate Railway service named `afg-ai-admin-terminal`: runs `npm run terminal:worker` continuously.
- PostgreSQL: durable queue, worker heartbeat, job status and bounded result storage.
- Existing provider gateway: verifies models and streams text from the selected configured provider.

The worker uses the same repository and must be deployed from the same branch/commit as the API. It needs the same database connection and provider configuration as the API because it reads the provider registry and uses the existing server-side adapters.

## API

All routes require an active administrator session and CSRF protection for writes.

- `GET /api/admin/terminal-gateway/status` — worker heartbeat and queue counts.
- `POST /api/admin/terminal-gateway/jobs` — enqueue an AI task. Body: `{ "model": "auto", "messages": [{"role":"user","content":"..."}] }`.
- `GET /api/admin/terminal-gateway/jobs` — recent jobs submitted by the current administrator.
- `GET /api/admin/terminal-gateway/jobs/:id` — job status and result.

Only `user` and `assistant` messages are accepted. System instructions are created by the server/provider service. Job payloads are bounded, results are capped, jobs expire after 30 minutes, and workers claim jobs using PostgreSQL row locking so multiple worker replicas do not claim the same job.

## Railway service setup (not performed by this source change)

Create a second service from the same GitHub repository and branch:

- Service name: `afg-ai-admin-terminal`
- Build command: `npm install`
- Start command: `npm run terminal:worker`
- Required variables: `DATABASE_URL` and the same provider variables/encryption settings used by the API.
- Restart policy: Always.

Do not copy browser cookies, personal account passwords, or session tokens into the worker. Do not enable `TERMINAL_EXEC_ENABLED`. The existing web terminal remains a browser-isolated workspace.

## Admin dashboard

The authenticated Admin panel includes an **Online Admin Terminal** tab. It displays the last worker heartbeat, queue counts, recent jobs, job status, provider/model identity, and completed text output. It can submit an administrator AI request and refreshes status every eight seconds while the tab is open. The dashboard is not a shell and has no arbitrary command execution.

## Current delivery boundary

This milestone adds the durable queue, worker process, admin-only API, and administrator dashboard. It does not yet route ordinary end-user `/api/chat` traffic through the queue. The worker is not online until the database migration is applied and the separate Railway service is created and deployed. The dashboard will honestly show the worker as offline until a heartbeat is received.
