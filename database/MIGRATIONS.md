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


## Persistent API quota queue

Migration `0023_api_connector_quota_queue.sql` adds a durable queue state to owner-scoped API connectors. HTTP 402/429 responses park the affected connector as `waiting` without deleting its endpoint, encrypted credential, priority, or configuration. If the upstream response supplies a valid `Retry-After` or rate-limit reset header, the connector becomes eligible again after that time when the user's API tools are next discovered or called. If the provider supplies no reset time, the connector remains waiting until its owner verifies it again or explicitly re-enables it; AFG AI does not guess monthly renewal dates. Other transient 5xx/network errors continue through the existing retryable fallback path and do not automatically mark the connector quota-exhausted.


## Public API implementation coverage

Migration `0024_public_api_implementation_tracking.sql` adds a durable per-catalog-entry implementation ledger and records whether both upstream catalogue sources were fully synchronized. New entries begin as `catalogued`; later verified documentation/OpenAPI discovery advances them without resetting progress on future catalogue syncs. Statuses distinguish catalogue-only entries, documentation discovery, contract discovery and unsupported protocols. Endpoint verification, credential configuration, successful probes, enabled state and quota waiting remain owner-scoped in the connector records and quota queue. This table contains public integration metadata only; user API credentials remain encrypted in owner-scoped connector records. Apply the migration before using the new tracking dashboard or running another catalog sync.


## Public API discovery work queue

Migration `0025_public_api_discovery_work_queue.sql` adds a durable, bounded admin review queue for each tracked Public API entry. Admins claim up to 25 entries per batch with a 20-minute renewable-by-reclaim lease; expired claims return to the queue and concurrent admins use row locks with `SKIP LOCKED`. Manually recording verified documentation or a discovered contract completes the work item; the automatic official-docs scan keeps the claim active for the next contract-extraction step. Explicitly unsupported protocols are marked blocked; retry returns the item to the queue. This queue does not execute third-party APIs, infer quotas, create credentials, or enable connectors. Apply migration 0025 after 0024 before using the queue controls.


## Public API official documentation evidence

Migration `0026_public_api_docs_evidence.sql` stores bounded evidence extracted from the catalogue entry's official documentation page: same-host OpenAPI/Swagger link candidates, explicit protocol labels, and authentication terms found in the page text. The discovery endpoint only accepts an API already claimed by the current administrator, fetches the catalogue's HTTPS documentation/homepage URL with DNS/SSRF checks, refuses redirects and cross-host links, and caps the response size. These findings are discovery hints, not a verified API contract, endpoint probe, quota confirmation, credential, or permission to enable a connector. Apply migration 0026 after 0025 before using this feature.


## Observed upstream API quota responses

Migration `0027_api_connector_rate_limit_observations.sql` adds owner-scoped storage for rate-limit headers actually returned by an API connector. The executor records a bounded allowlist of upstream response headers (including Retry-After, RateLimit and X-RateLimit limit/remaining/reset fields), the observed HTTP status and timestamp, and a parsed reset instant only when the upstream supplied a valid future value. HTTP 402/429 responses keep the connector in the waiting queue; a known reset makes it eligible after that instant, while a missing reset remains a manual-review state. Connector listing exposes this evidence without exposing credentials. Successful and other non-quota responses may refresh the last observed header snapshot but do not clear a prior quota status. Apply migration 0027 after 0026 before using these fields. No monthly renewal date or remaining quota is inferred.

## API connector quota recovery claims

Migration `0031_api_connector_quota_recovery_claims.sql` adds a short-lived claim timestamp to serialize individual and batch quota recovery probes. The owner-triggered batch action checks at most five connectors whose observed upstream 402/429 reset timestamp has elapsed. Successful probes clear the old quota observation and return the connector to verified/ready while keeping it disabled for explicit owner activation. Unknown reset times are never guessed or probed. Apply with `npm run db:migrate` after reviewing the backup and recovery plan.

## Scheduled API connector health monitoring

Migration `0032_api_connector_health_monitor.sql` adds opt-in monitoring fields and a due-check index. Monitoring can be enabled only for verified, enabled GET connectors; non-idempotent methods are excluded. The scheduler endpoint `POST /api/internal/connector-monitor/run` is protected by the high-entropy `AFG_CONNECTOR_MONITOR_SECRET` bearer secret and checks at most five due connectors per run. Configure a hosting cron/scheduler to call it every 15 minutes. The connector-specific interval is 60–10,080 minutes, defaulting to 360. The migration is additive and must be applied with the normal migration runner after reviewing the backup/recovery plan.
