# AFG AI Security Controls

This document records the security controls present in the application and the remaining deployment/integration work. A checklist item is not considered complete merely because it is documented.

## Implemented in the application

- **Transport security:** the Express entry point redirects production HTTP requests to the configured HTTPS `APP_ORIGIN`, emits HSTS for secure production requests, disables `X-Powered-By`, and sets MIME-sniffing, framing, referrer, and permissions headers.
- **Content Security Policy:** production responses use a restrictive CSP (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `script-src 'self'`). Inline styles are currently permitted for the existing UI; remove that exception only after replacing runtime inline styles with classes/nonces.
- **Password storage:** new passwords are hashed with Argon2id. Password verification supports Argon2id and legacy bcrypt/scrypt hashes; scrypt uses `timingSafeEqual`, and malformed hashes fail closed.
- **Sessions:** random session tokens are stored as SHA-256 hashes, never plaintext. CSRF uses a random double-submit cookie and timing-safe comparison. Admin role changes and suspensions revoke the affected user's active sessions.
- **CSRF:** unsafe browser/cookie-authenticated API requests are rejected unless the CSRF token matches. Admin and personal workspace handlers also enforce CSRF at their own boundary.
- **Authorization and ownership:** admin routes require an authenticated administrator. Personal productivity records are queried, updated, and deleted with both record ID and authenticated owner ID in the SQL predicate.
- **Rate limiting:** database-backed counters cover IP, authenticated user/tier, model (when the model identifier is supplied), and authentication attempts. IP addresses are hashed before persistence.
- **Validation:** authentication, chat, and productivity payloads use Zod schemas; shared JSON parsing rejects prototype-pollution keys, excessive nesting, and oversized bodies.
- **Output safety:** the client uses React Markdown without enabling raw HTML parsing. Do not add `rehype-raw` or inject model output with `dangerouslySetInnerHTML` unless a strict sanitizer is added first.
- **Secret-safe logs:** console output is recursively redacted for common API keys, bearer credentials, GitHub/Slack tokens, password/token-like fields, and database URL credentials.
- **Audit trail:** administrator changes are written to `audit_logs`; authentication and API security events are written to `security_events`.
- **Upload validation primitive:** `src/security/upload.ts` enforces a 15 MB cap, extension allowlist, magic-byte checks, generated filenames, private directory storage, exclusive file creation, and mode 0600. It deliberately leaves files quarantined.

## Required before enabling uploads or production launch

1. **Upload route integration is not yet complete.** There is no general-purpose upload endpoint wired to `quarantineUpload`. When one is added, it must authenticate the user, enforce CSRF, apply per-user quotas, stream with a hard byte limit, store only in private persistent storage, and never expose quarantine paths. A malware/content scanner must explicitly approve files before any downstream parser or download handler can access them.
2. Set `AFG_UPLOAD_QUARANTINE_DIR` to an absolute private persistent-storage path outside the web root. Do not use a public/static directory.
3. **Dependency lockfile:** the repository currently has no npm lockfile. Generate and commit `package-lock.json` using the project's approved Node/npm toolchain, then use `npm ci` in CI/deploy builds. Do not claim reproducible dependency installation until this is committed.
4. Review the CSP in a real production deployment. The current `style-src 'unsafe-inline'` exception is a compatibility compromise, not a fully nonce/hash-based strict style policy.
5. Confirm the hosting proxy forwards HTTPS correctly so Express sees `req.secure`; keep `APP_ORIGIN` set to the canonical HTTPS origin. HSTS is only emitted for secure production requests.
6. Configure a trusted proxy boundary before relying on forwarded client IPs. Never trust arbitrary client-supplied `X-Forwarded-For` values.
7. Run dependency auditing, static analysis, and security tests before release. These checks were intentionally not run as part of this code change.

## Environment

- `APP_ORIGIN`: canonical HTTPS origin in production.
- `AFG_UPLOAD_QUARANTINE_DIR`: absolute private path for quarantined uploads.
- `DATABASE_URL`: backend-only PostgreSQL connection string. Never expose it through a `VITE_*` variable.
- `AFG_EMAIL_CODE_PEPPER`: optional independent pepper for email verification/reset code hashes.

## Operational rule

Never log request bodies, cookies, authorization headers, raw provider credentials, uploaded file contents, or full database connection strings. Never serve quarantined files. Security controls fail closed when their required database or configuration dependency is unavailable.
