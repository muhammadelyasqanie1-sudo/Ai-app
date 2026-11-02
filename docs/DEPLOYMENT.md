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

Apply migrations `0004_terminal_foundation.sql`, `0005_cli_token_rate_limits.sql`, `0006_terminal_audit_output.sql`, and `0007_offline_pack_registry.sql` after backup and only through the normal migration process. These migrations have not been applied by this work. The Terminal API is read-only and uses PostgreSQL-backed sessions, scoped tokens and audit records. Keep `TERMINAL_EXEC_ENABLED=false`. No sandbox backend is currently available; setting this flag to true does not make shell execution safe or supported.

## Offline Learning

Offline Learning is not deployable in this release. The Ollama and pack variables are placeholders. Reusable Ed25519/SHA-256 verifiers and IndexedDB local-store foundations now exist under `packages/offline`, but they are not connected to a catalog or runtime. Do not configure a public Ollama endpoint or proxy local Ollama through the cloud API. A signed catalog, trusted key rotation, static pack mirror, local model runtime and offline tutor are prerequisites.

## Migrations

Never apply migrations automatically during deployment. Back up PostgreSQL, review the numbered SQL migration, then run the project's migration command only with explicit operator approval.
