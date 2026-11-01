# AFG AI database backup and restore

AFG AI uses PostgreSQL. Keep backups encrypted and outside the application repository. Never commit database dumps, credentials, session tokens, or provider secrets.

## Prerequisites

Install PostgreSQL client tools (pg_dump, pg_restore, psql) and set DATABASE_URL in a trusted shell. For production, use a dedicated backup role with read access and a restore role with schema ownership.

## Create a compressed backup

Run from a trusted machine or terminal. The output contains private user data; protect it.

    umask 077
    pg_dump --format=custom --no-owner --no-acl --file "afg-ai-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"

Encrypt the dump with an approved tool (such as age or GPG) before uploading it to private storage. Do not store the encryption key beside the backup.

## Verify a backup

    pg_restore --list "afg-ai-YYYYMMDDTHHMMSSZ.dump" > /dev/null

Periodically restore to a separate staging database and verify row counts and application health. A successful dump alone does not prove recoverability.

## Restore

1. Stop application writes or place the app in maintenance mode.
2. Create an empty target database and set DATABASE_URL to that target.
3. Restore the dump:

       pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" "afg-ai-YYYYMMDDTHHMMSSZ.dump"

4. Run npm run db:migrate to apply migrations created after the backup.
5. Start the application and verify /api/ready, authentication, conversation history, and admin access.
6. Keep the previous database untouched until the restored instance is confirmed.

## Operational policy

- Schedule daily backups and retain at least 7 daily and 4 weekly copies; adjust retention to legal and storage requirements.
- Use point-in-time recovery/WAL archiving where the PostgreSQL provider supports it.
- Encrypt backups in transit and at rest; restrict access and log restore operations.
- Test a restore at least monthly and after major schema changes.
- A restore can overwrite newer data. Confirm the target database carefully before running pg_restore.
