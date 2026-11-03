# Database migrations

Migrations use ordered filenames in the form NNNN_description.sql and are applied once in lexical order.

Set DATABASE_URL and run:

    npm run db:migrate

The runner creates schema_migrations, applies each migration in its own transaction, stores a SHA-256 checksum, and refuses to silently re-run or accept edits to an already-applied migration. Add a new numbered file for every later schema change.

The canonical data-model migration is additive and preserves legacy tables and columns still used by the existing API. It backfills profiles, preferences, providers, models, usage, memory, and audit aliases where possible.

Existing installations initialized with database/schema.sql can run the migration runner afterwards. New installations should use the migration runner as the schema source of truth. The older schema.sql remains a legacy bootstrap/reference file until all environments have migrated.

See BACKUP-RESTORE.md for the documented backup and recovery procedure. Never commit database dumps or secrets.

Locale persistence is introduced by `0003_user_locale_settings.sql`. It creates `user_settings.locale` and backfills it from existing account preferences. Apply it with the normal migration runner before deploying the updated account API.


## Custom provider credentials

Custom provider credentials are encrypted with AES-256-GCM before storage in the canonical `providers.config_encrypted` column. Configure `AFG_PROVIDER_SECRET_ENCRYPTION_KEY` on the backend only as a base64-encoded 32-byte key (for example, generate it with `openssl rand -base64 32`). Keep the key stable and backed up securely: changing or losing it makes existing encrypted provider configurations unreadable. Do not put it in a `VITE_*` variable or source control.

The initial custom-provider adapter supports OpenAI-compatible `/models` and `/chat/completions` endpoints only. Other provider formats need dedicated adapters and are rejected rather than being treated as compatible. Credentials and custom headers are never returned by the provider administration API. The additive registry metadata is in `0009_custom_provider_registry.sql`; it is not applied automatically.
