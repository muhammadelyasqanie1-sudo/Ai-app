# AFG AI — Security Notes

## Secrets handling
- All provider API keys and user connector keys are encrypted at rest with AES-256-GCM (`src/lib/afg/crypto.ts`) using `AFG_VAULT_KEY`.
- Keys are never returned to the browser — only a masked form (`••••••••last4`).
- `AFG_SESSION_SECRET` signs share tokens (HMAC-SHA256, truncated MAC) and pepper verification codes.
- Verification/reset codes are stored as SHA-256 hashes, single-use, 15-minute TTL.
- Audit/error log metadata redacts key-looking fields before persistence.

## Authentication
- Passwords: scrypt (N=16384, r=8, p=1) with per-user random salt; constant-time verification.
- Sessions: 32-byte random tokens, stored hashed (SHA-256), httpOnly + SameSite=Lax cookies, `Secure` when APP_ORIGIN is HTTPS in production; 30-day TTL; suspension/password-reset revokes all sessions.
- Login/register/guest endpoints are rate-limited per IP (DB-backed sliding window).
- Account enumeration is avoided on reset (uniform response for unknown emails).

## Authorization
- Roles: USER < STAFF < ADMIN. Staff actions require an explicit permission key (`users.write`, `providers.write`, …); ADMIN bypasses.
- The consolidated admin API enforces permission per section and verb (read vs write vs delete).
- Ownership checks on every conversation/message/attachment/connector operation.
- Last-admin protection prevents demoting/deleting the final administrator; the built-in AFG Cloud provider cannot be disabled or deleted.

## Uploads & files
- MIME allowlist + extension allowlist + magic-byte verification (renamed executables are rejected).
- Size cap 15 MB; filenames sanitized; content stored outside public web root; downloads are authenticated, owner-checked, and served with path-traversal guards (resolved path must stay under the uploads directory).

## Injection & abuse
- Math tool is a hand-written recursive-descent parser — no `eval`, identifiers restricted to a function/constant whitelist.
- Page Reader accepts only http(s) URLs.
- All request bodies are validated with zod schemas; Prisma parameterizes all queries.
- Rate limits: chat (60/h user, 15/h guest), tools (40/h), uploads (30/h), images (10/h), voice (40/h), auth (20/h).

## Error hygiene
- Route handlers wrap in a uniform error boundary; internal stack traces are logged server-side only; clients receive stable error codes.
- Provider stream failures surface the upstream message (useful, bounded) and are recorded in the error log.

## Reporting / hardening backlog
- Consider CSRF tokens for state-changing APIs if embedding beyond same-site contexts (SameSite=Lax currently mitigates classic CSRF).
- Consider adding 2FA (TOTP) and per-user session listing/revocation UI.
- Add Content-Security-Policy headers in `next.config.ts` for strict deployments.
