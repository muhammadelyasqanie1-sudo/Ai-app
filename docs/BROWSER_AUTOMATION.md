# AFG AI Browser Automation

## What this adds

AFG AI can operate a real remote Chromium browser through Playwright and Browserbase. This is browser control, not a simulated UI and not an unrestricted desktop-control agent.

The authenticated chat tool catalog exposes these actions only when the database migration is present and both provider secrets are configured:

- `browser_open` — open a public HTTP/HTTPS website.
- `browser_snapshot` — read visible page text and the current visible interactive controls.
- `browser_click` — click a control identified by a fresh snapshot reference.
- `browser_type` — fill a visible non-password input or editable field.
- `browser_press` — press a restricted set of keyboard keys.
- `browser_scroll` — bounded scrolling.
- `browser_wait` — wait for a dynamic page update and take a new snapshot.
- `browser_stop` — release the active remote session while preserving the per-user Browserbase Context.

The chat tool loop allows up to six rounds for a requested browser task, with a 180-second request deadline. The model must take a fresh snapshot after navigation or any action that may change the page and use only references returned by that latest snapshot.

## Provider setup

Create a Browserbase project and configure these server-side environment variables in the hosting service:

- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

The application uses Browserbase's hosted Chromium environment and Playwright CDP connection. It does not download or run a local Chromium binary on the AFG AI server.

Apply database migration `0042_browser_automation_profiles.sql` after taking a database backup and reviewing the recovery plan. The migration stores a user-to-Context mapping, active session identifier, and limited page activity metadata. Browser cookies and website login state remain in the isolated Browserbase Context, not in AFG AI's PostgreSQL database.

Browserbase usage, concurrent sessions, persistent Contexts, and session duration are subject to the Browserbase account's current plan and limits. The source code does not provision a Browserbase account, create provider credentials, apply migrations, or deploy the app.

## Gmail and website sign-in

To sign in to Gmail:

1. Ask AFG AI to open `https://mail.google.com/`.
2. The browser tool returns a `liveViewUrl` for the user's isolated remote browser.
3. Open that live browser view and personally enter the Google email address, password, passkey, MFA/one-time code, and any security challenge.
4. Return to the AFG AI chat and tell it after sign-in is complete.
5. AFG AI can then take a new snapshot and act on the signed-in page according to the user's instructions.

AFG AI never asks the user to paste Gmail passwords or one-time codes into chat and its browser typing tool refuses password fields. CAPTCHA solving is explicitly disabled; the user must complete any CAPTCHA, MFA, passkey, anti-bot, or Google security check manually. A login may be rejected or require additional verification by Google.

This is UI automation through the user's browser session; it is not a Gmail API OAuth integration. A future Gmail API integration should use Google's OAuth consent screen and the narrowest scopes needed for the requested operation.

## Security boundaries

- Browser actions require a signed-in AFG AI user.
- Each AFG AI user gets a separate persistent Browserbase Context.
- A PostgreSQL advisory lock serializes operations against one user's active session.
- Initial URLs and main-frame navigations are restricted to public HTTP/HTTPS destinations; private, loopback, link-local and reserved network addresses are blocked after DNS resolution.
- Password fields cannot be filled by the AI tool.
- Fresh element references are required for click/type actions; stale references fail rather than targeting a different element.
- Page contents, emails, links, and website instructions are treated as untrusted data.
- Browserbase session recording and session logging are explicitly disabled when a new session is created.
- Sending, deleting, purchasing, payment, transfer, publishing, posting, and other consequential actions require explicit user approval for the exact action.
- Do not use the browser to collect credentials, evade access controls, bypass security challenges, or access accounts the user is not authorized to use.

## Activation checklist

Browser automation is **not active in a deployed environment** merely because these source changes are committed. Activation requires all of the following:

1. Install the new runtime dependencies during the next approved deployment.
2. Set `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` as private server environment variables.
3. Apply migration `0042_browser_automation_profiles.sql` after backup approval.
4. Deploy this working branch (or merge it through the repository's normal review process).
5. Confirm the authenticated browser status endpoint `GET /api/browser/status` reports configured and migration-ready.

The user can end a session with `DELETE /api/browser/session`; the remote session is released and its persistent Context is retained for the same AFG AI user.
