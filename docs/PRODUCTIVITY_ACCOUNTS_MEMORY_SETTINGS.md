# AFG AI — Productivity, Accounts, Memory and Settings (3.11–3.14)

## 3.11 Productivity Center
The Tools Center includes Notes, Summarizer, Idea Generator, Study Assistant, Task Planner, Meeting Summarizer, Email Assistant, Brainstorm, Content Planner and Knowledge Workspace. Each mode has a server-owned system prompt and allowlisted parameter schema in `src/api/productivity.ts`. Signed-in users can create, list, edit, pin and delete their own saved items through the authenticated `/api/productivity/items` routes. Completed AI outputs are automatically saved to the signed-in user's workspace. Items are isolated by `user_id`.

## 3.12 Accounts and authentication
- Email/password registration requires a valid email, a 12+ character password and configured `RESEND_API_KEY` plus `EMAIL_FROM`. A six-digit email verification code expires after ten minutes and is attempt-limited.
- Password reset uses a time-limited email code and revokes existing sessions.
- Passwords use bcryptjs cost 12. Legacy scrypt password hashes are verified and upgraded to bcrypt after a successful login.
- Google OAuth is exposed only when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_ORIGIN` are present. Configure the Google redirect URI as `https://YOUR_APP_ORIGIN/api/auth/google/callback`.
- Sessions use random opaque tokens stored as SHA-256 hashes in PostgreSQL, httpOnly cookies, Secure in production, SameSite=Lax, CSRF tokens and server-side revocation.
- Phone verification is not exposed because no SMS adapter/provider is configured.

## 3.13 Personalization and memory
Memory categories are `preferences`, `language`, `style` and `facts`. Users can list, add, edit and delete memory items and turn memory off. The chat handler injects saved memories only for an authenticated user when both account and preference-level memory switches are enabled. Sensitive-content detection requires an explicit per-item consent flag before storing a detected sensitive item. Memory is never needed for anonymous chat.

## 3.14 Settings and privacy
Preferences persist per account: appearance (light/dark/neon/system), accent color, density, font size, chat width, animations, app language, default model, auto-select, response style/length, creativity, memory, voice and notification toggles. The app asks for a language choice on first launch and applies RTL for Dari. Settings also include password change, active-session listing/revocation, JSON data export, server and local conversation clearing, memory management and account deletion with a confirmation phrase (plus current-password confirmation when a password credential exists).

Security notifications are generated for successful sign-ins, email verification, password resets and password changes. They respect the in-app and security-alert toggles; when email notifications are enabled and Resend is configured, security alerts are also sent by email. Product update broadcasts are admin-only, audited and opt-in. Administrators can send audited in-app product-update broadcasts through the Admin panel; delivery is limited to users who opted into both product updates and in-app notifications. Usage-alert event production is not connected because provider usage/token accounting is not yet recorded.

## Required setup
1. Configure `DATABASE_URL` on Render.
2. Apply the additive `database/schema.sql` to the PostgreSQL database. The app does not run migrations automatically.
3. For registration and password reset, configure `RESEND_API_KEY` and `EMAIL_FROM`. Optionally configure `AFG_EMAIL_CODE_PEPPER` (the Resend key is used as fallback).
4. For Google login, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_ORIGIN`; register the callback URL above in Google Cloud Console.
5. Deploy the app after installing the new `bcryptjs` dependency.

## Operational limitations
- No SMS provider is integrated; phone verification remains hidden/unavailable.
- Product-update and usage-alert notifications still need their event producers. Security events are wired to the in-app inbox and optional Resend email delivery.
- The current chat UI history remains browser/device storage; the privacy delete action also clears any server-stored conversation records owned by the account. The export includes local history from the browser; it is not synchronized to PostgreSQL by this feature.
- Database schema changes must be applied manually before using authenticated workspace/account endpoints.
- No build, lint, tests, database migration or deployment was run as part of these source changes.
