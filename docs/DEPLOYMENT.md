# AFG AI deployment configuration

The current deployment uses the root Vite/Express application. There is no checked-in Render Blueprint, Dockerfile, Wrangler configuration or isolated terminal sandbox manifest.

## Required baseline

- Node.js 22+
- PostgreSQL 15+
- HTTPS at the hosting edge; set `APP_ORIGIN` to the canonical HTTPS origin.
- At least one supported server-side AI provider.
- Configure secrets only in the hosting provider's secret/environment settings.

See `.env.example` and the root README for the complete current configuration inventory.

## Terminal

Apply migration `0004_terminal_foundation.sql` after backup and only through the normal migration process. The Terminal API is read-only and uses PostgreSQL-backed sessions, scoped tokens and audit records. Keep `TERMINAL_EXEC_ENABLED=false`. No sandbox backend is currently available; setting this flag to true does not make shell execution safe or supported.

## Offline Learning

Offline Learning is not deployable in this release. The Ollama and pack variables are placeholders. Do not configure a public Ollama endpoint or proxy local Ollama through the cloud API. A signed catalog, trusted public key, static pack mirror, local runtime and offline storage implementation are prerequisites.

## Migrations

Never apply migrations automatically during deployment. Back up PostgreSQL, review the numbered SQL migration, then run the project's migration command only with explicit operator approval.
