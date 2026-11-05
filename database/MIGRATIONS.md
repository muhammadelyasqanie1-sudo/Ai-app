# Database migrations

Migrations use ordered filenames in the form NNNN_description.sql and are applied once in lexical order.

Set DATABASE_URL and run:

    npm run db:migrate

The runner creates schema_migrations, applies each migration in its own transaction, stores a SHA-256 checksum, and refuses to silently re-run or accept edits to an already-applied migration. Add a new numbered file for every later schema change.

The canonical data-model migration is additive and preserves legacy tables and columns still used by the existing API. It backfills profiles, preferences, providers, models, usage, memory, and audit aliases where possible.

Existing installations initialized with database/schema.sql can run the migration runner afterwards. New installations should use the migration runner as the schema source of truth. The older schema.sql remains a legacy bootstrap/reference file until all environments have migrated.

See BACKUP-RESTORE.md for the documented backup and recovery procedure. Never commit database dumps or secrets.

Locale persistence is introduced by `0003_user_locale_settings.sql`. It creates `user_settings.locale` and backfills it from existing account preferences. Apply it with the normal migration runner before deploying the updated account API.

## Private file library

Migration `0010_private_file_quarantine.sql` adds owner-scoped metadata for private uploads. Apply it with the normal migration runner before using `/api/files`.

Set `AFG_UPLOAD_QUARANTINE_DIR` to an **absolute path on a private persistent disk** (for example, `/var/data/afg-uploads` on a Render disk mounted at `/var/data`). Do not use the repository, `public/`, or `dist/` directories. The directory is created with restrictive permissions by the upload service. The service rejects symlink targets, the filesystem root, and paths inside the application directory; the status endpoint validates the configured directory before enabling uploads.

Uploads are signature-checked and stored under generated filenames, then marked `quarantined`. The current product does not include malware scanning or safe document extraction, so files cannot be downloaded, parsed, or sent to AI yet. Keep chat file attachments disabled until a scanner and approved-file delivery pipeline are implemented.


Migration `0009_staff_rbac_foundation.sql` adds backend-enforced staff roles and their initial permission maps. Apply it with `npm run db:migrate` only after reviewing the backup and deployment plan.


Migration `0011_remove_cloudflare_workers_ai.sql` removes Cloudflare Workers AI from the provider registry and clears its model/fallback selections. Cloudflare R2/KV storage configuration is independent and is not removed by this migration.


## Public API connector fallback groups

Migration `0022_api_connector_fallback_groups.sql` adds optional per-user fallback group and priority fields to API connectors. Connectors in the same group are eligible as sequential alternatives only when they are enabled, verified, owned by the same user, and have the same HTTP method and exact JSON input schema. Apply with `npm run db:migrate` after reviewing `BACKUP-RESTORE.md`. The migration has not been run against any hosted database as part of source changes.
