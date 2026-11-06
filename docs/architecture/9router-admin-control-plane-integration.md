# AFG AI ↔ 9Router Admin Control Plane Integration

Status: design baseline only; no production settings, secrets, provider connections, or deployments changed.

## User requirements

- Preserve the existing 9Router dashboard design and navigation.
- Integrate 9Router administration into the existing AFG AI Admin Control Plane.
- No public or self-service access to the 9Router dashboard or management APIs.
- Only the root administrator and staff explicitly granted the relevant AFG AI permission may administer selected 9Router functions.
- Ordinary AFG AI users must never receive 9Router dashboard access or management credentials.
- Provider inventory for this migration is APInex (model provider), Tavily (web search/fetch), and Resend (transactional email). Resend remains in AFG AI and is not routed as an AI model provider.
- Do not remove existing working connections before replacement paths are verified.

## Verified current AFG AI implementation

- `src/api/adminHandler.ts` authenticates admin requests, checks CSRF for mutations, applies per-user admin rate limits, reads staff role permissions, and writes audit events.
- `src/security/adminPermissions.ts` already maps `/api/admin/9router/gateway` to `settings:read` / `settings:manage`, and `/api/admin/9router/metrics` to `usage:read`.
- `GET /api/admin/9router/metrics` currently reports AFG AI's own `ninerouter_request_logs` metrics; it is not a remote 9Router dashboard-management API.
- `PATCH /api/admin/9router/gateway` toggles the AFG AI-side gateway feature flag; it does not lock down or administer the remote 9Router deployment.
- The current provider administration API deliberately restricts global model providers to 9Router and Ollama; provider keys are described as managed by the 9Router integration.
- `src/security/providerVault.ts` uses AES-256-GCM for provider secrets and requires a server-side 32-byte `PROVIDER_KEYS_MASTER_KEY`.
- Existing staff permissions include provider, model, routing, user, audit, security, dashboard, usage, system, settings, subscription and notification permissions. A dedicated 9Router administration permission should be introduced rather than reusing broad settings access.

## Verified 9Router security facts from upstream documentation

- The dashboard has its own password/session authentication and a default initial password that must be replaced.
- `REQUIRE_API_KEY` protects the OpenAI-compatible `/v1/*` routes; it is not by itself a dashboard/admin access policy.
- 9Router supports its own API-key-based client access and dashboard management endpoints. AFG AI must not expose a 9Router admin password, session cookie, or service credential to browser JavaScript.
- The public Railway URL currently exists; therefore "only invited administrators" must be enforced at the dashboard/API edge, not merely by hiding a link in AFG AI.

## Target architecture

1. AFG AI Admin remains the only human-facing control plane.
2. The browser calls AFG AI's authenticated admin APIs only.
3. AFG AI server acts as a Backend-for-Frontend (BFF) to the 9Router management surface. Server-side credentials remain server-only.
4. 9Router dashboard routes and management APIs are blocked from anonymous/public access at the edge. Only the AFG AI BFF and explicitly authorized administrator access path may reach them.
5. 9Router's inference endpoint is separately protected with a dedicated gateway API key; it is not granted dashboard/admin permissions.
6. AFG AI role permissions determine which staff can read metrics, manage provider connections, import keys, edit routing, or administer security. Root administrator retains full control.
7. Every mutating remote operation is audited in AFG AI with actor, action, target, timestamp, result, and redacted metadata.
8. No provider secret is returned to the browser. Key creation accepts secrets once, stores them encrypted or forwards them directly to the intended vault, and returns only masked hints/status.

## Required permissions (proposed)

- `ninerouter:read`: read remote health, connection summaries, models and usage.
- `ninerouter:providers:manage`: create/update/test/disable provider connections and bulk-import keys.
- `ninerouter:routing:manage`: manage combos, fallback order and routing policy.
- `ninerouter:security:manage`: rotate gateway credentials, revoke sessions, update access policy.
- `ninerouter:dashboard:access`: grant temporary/direct dashboard access to a named staff account when explicitly approved by a root admin.

No staff role receives these permissions by default. Root admin can grant/revoke them. Access revocation must invalidate outstanding sessions/tokens.

## Phased implementation

### Phase 0 — read-only verification
- Inspect current deployed 9Router version, auth settings and routes without exposing secret values.
- Confirm the exact dashboard and management API auth contracts for the deployed version.
- Confirm the existing AFG AI Admin UI entry point and navigation structure.
- Inventory current Railway variable names only; never print values.

### Phase 1 — access lockdown
- Replace any default/weak dashboard password with a unique strong secret.
- Enforce HTTPS secure cookies.
- Enable `REQUIRE_API_KEY` for inference routes.
- Add an edge policy for dashboard and management routes: deny by default; allow only AFG AI BFF and approved admin access path.
- Keep inference API access separate from dashboard access.
- Verify unauthenticated dashboard and management requests are denied before changing provider configuration.

### Phase 2 — scoped service-to-service control
- Add a dedicated server-only credential or signed service identity with narrow management scopes; do not reuse the inference API key as an admin credential.
- Implement AFG AI BFF endpoints with strict allowlists for supported remote operations, request/response validation, timeouts, rate limits and redaction.
- Do not proxy arbitrary URLs or arbitrary 9Router paths.

### Phase 3 — AFG AI Admin integration
- Add a 9Router AI Gateway section inside the existing Admin Control Plane without changing 9Router's own design.
- Show real remote status and data only; label unavailable capabilities as unavailable rather than using mock data.
- Add authorized workflows for APInex multi-key import/rotation, Tavily Web Search/Web Fetch, models, routing, usage and audit.
- Keep Resend in AFG AI's email configuration.

### Phase 4 — validation and cutover
- Test role matrix: anonymous, ordinary user, staff without permission, staff with read-only permission, staff with manage permission, root admin.
- Test CSRF, rate limits, credential redaction, audit trail, session revocation and direct-origin bypass attempts.
- Verify APInex and Tavily through 9Router before switching AFG AI traffic.
- Preserve rollback path and old connections until success is verified.

## Explicit non-goals / safety constraints

- No visual redesign of 9Router.
- No public registration or public dashboard access.
- No admin secrets in browser storage, HTML, logs, URLs or client bundles.
- No direct deployment, migration, destructive change, provider-key rotation or production password change during the read-only phase.
- No builds/tests/deployments until separately authorized.
- Never claim the deployment is private until direct-origin and edge-bypass tests prove it.


## Implementation progress (2026-11-06)

### Completed on `feat/9router-admin-control-plane`

- Added the authenticated account role to the client profile type and populated it from `/api/auth/me`.
- Replaced the old in-app Admin panel navigation item with a **9Router Admin portal** link shown only for `admin` and `superadmin` profiles.
- The link opens a new browser tab, then asks AFG AI's existing authenticated `GET /api/9router/status` route for the configured dashboard URL. That route already enforces administrator-only access on the server. The browser never receives the 9Router service API key.
- Removed the legacy in-app `AfgAdminPanel` renderer from the main application route.
- Added dedicated 9Router staff permission identifiers to the permission type and role editor allowlist. Existing 9Router metrics/gateway routes now use dedicated read/security scopes rather than generic settings/usage scopes.


### Upstream 9Router management API contract (source inspection)

The upstream 9Router dashboard is a separate authenticated web application. Its dashboard management APIs include:

- Authentication/settings: `/api/auth/login`, `/api/auth/logout`, `/api/settings`, `/api/settings/require-login`.
- Provider connections: `/api/providers`, `/api/providers/{id}`, provider test/model endpoints, and `/api/provider-nodes*`.
- Routing and access keys: `/api/models/alias`, `/api/combos*`, `/api/keys*`, `/api/pricing`.
- Usage and logs: `/api/usage/history`, `/api/usage/logs`, `/api/usage/request-logs`, and connection-specific usage routes.
- CLI integration: `/api/cli-tools/*` for supported developer tools.

The upstream dashboard guard protects dashboard routes with the `auth_token` cookie when login is required, and protects management API prefixes such as providers, keys, combos, settings, and usage. The public `/v1/*` inference routes use a separate API-key check. Therefore AFG AI must not treat its existing inference key as a dashboard-management credential. The management API proxy must use an authenticated 9Router dashboard session or another upstream-supported privileged identity, never forward arbitrary browser-supplied cookies or arbitrary paths.

This contract was checked against the upstream source tree; before implementation, confirm it still matches the deployed `v0.5.112` build because the public repository's moving branch may differ from the deployed image.

### Not yet completed — do not treat as production-secure or fully migrated

- The Railway 9Router dashboard origin is still publicly addressable unless separately protected. Hiding the link in AFG AI is not an edge/network access control.
- The new link currently relies on 9Router's own browser login/password after redirect. No password is embedded in the URL or sent by AFG AI.
- The AFG AI BFF for remote 9Router management operations is not implemented yet. The existing status route only discovers the dashboard URL and health; it does not migrate users, billing, model catalog, provider management, routing, audit, or security administration.
- No Cloudflare Access/edge policy, private-origin restriction, password rotation, Railway variable changes, build, test, or deployment was performed in this change set.
- The old server-side AFG AI admin APIs have not all been removed or migrated; removing their UI renderer does not remove those APIs.

### Required next steps before claiming completion

1. Lock the 9Router dashboard and management routes at the edge and verify direct Railway-origin bypass is denied.
2. Implement scoped AFG AI BFF routes for every supported management domain, with server-only credentials, response validation, CSRF, rate limits and audit logging.
3. Move each supported AFG AI management domain to 9Router-backed data and actions, keeping Resend in AFG AI and preserving the existing APInex/Tavily connections until verified.
4. Add a root-admin-only onboarding/configuration path for the dashboard password and staff access grants; never put credentials in a URL.
5. Run the full role, bypass, session-revocation and provider-cutover validation matrix after explicit approval.


### UI cleanup follow-up (2026-11-06)

- Removed the unused legacy in-app admin panel and its panel-only client components from the AFG AI source tree.
- The AFG AI account menu continues to open the separate 9Router browser dashboard only for `admin` and `superadmin` accounts, after the server-side status check confirms the configured HTTPS dashboard URL is reachable.
- This is a UI cutover only. The AFG AI admin API, database tables, terminal worker, and management data remain in place until each corresponding capability has a verified replacement in 9Router. Do not claim full domain migration or delete those APIs yet.


### 9Router Management Center integration status (2026-11-06)

- 9Router now contains a permission-aware management landing page at `/dashboard/admin`.
- The 9Router sidebar exposes **AFG AI Control Plane** to the owner superadmin and control-plane users who have dashboard access.
- The landing page links to provider connections, routing/model aliases, API endpoints and keys, usage analytics, quota tracking, proxy pools, system tools, PXPipe, media providers, translation, and application settings. Visible sections are filtered by the current account's effective role/scopes; server-side route authorization remains authoritative.
- The owner-only staff and audit controls remain at `/dashboard/admin/users`.
- 9Router audit logging now covers provider connections, provider nodes, proxy pools, API keys, global settings, routing combo/model-alias changes, Headroom lifecycle actions, and PXPipe lifecycle actions. Secret values, API keys, cookies, proxy URLs, and command output are excluded from the new audit metadata.
- PRs 5–9 in `muhammadelyasqanie1-sudo/9router` are merged. The legacy AFG AI panel UI cleanup is merged as PR 96 in this repository.
- The AFG AI menu still opens the separate 9Router dashboard URL after its server-side HTTPS/reachability check; users then authenticate with the 9Router browser login and open the AFG AI Control Plane section.

### Remaining migration boundary

- This is not yet a complete migration of AFG AI's own user/subscription database, feature flags, announcement system, error telemetry, and all AFG AI-specific configuration APIs.
- AFG AI's server-side admin API and data tables remain intentionally intact until each domain has a verified replacement or a secure service-to-service bridge in 9Router.
- The new 9Router management UI and audit changes have not been deployed to the live Railway Docker-image service. No live environment variables, service image, or persistent volume were changed.
- Before claiming production cutover, enable `AFG_AI_CONTROL_PLANE=true` on the intended 9Router deployment, configure the owner login path, and verify browser login, staff scopes, direct-origin protection, and all API permissions against the actual deployed image.

### Direct browser control-plane entry (2026-11-06)

- The AFG AI administrator portal link now opens the dedicated 9Router URL `/control-plane`, not the general `/dashboard` landing page.
- The AFG AI server still checks 9Router health before returning the portal URL. The browser validates HTTPS and requires the exact `/control-plane` path; it does not receive a 9Router password, cookie, or service API key.
- 9Router's `/control-plane` route is protected by its control-plane session and the `dashboard:access` permission, then redirects to the permission-filtered `/dashboard/admin` management center. The normal sidebar no longer exposes an embedded admin link.
- The owner/staff member must authenticate through 9Router's own browser login. This is a separate browser session; AFG AI does not silently sign the user in.
- The 9Router control-plane route requires `AFG_AI_CONTROL_PLANE=true`. If the flag is disabled, the direct entry remains unavailable.

- The 9Router control-plane security work through PR #15 is merged: dedicated browser entry, permission-aware management center, audit events for provider/routing/settings/API-key/OAuth/usage-reset operations, persistent login lockouts, owner-only database export/import, `usage:manage` for credit-consuming resets, `providers:manage` for all OAuth actions, and local-only restrictions for host package installers.
- The 9Router repository's PRs #1–#15 are all merged. This confirms source integration only; it does not confirm that the Railway Docker-image deployment is running this source.
- This code change only updates the AFG AI portal destination. It does not deploy the AFG AI repository or change the live Railway Docker-image service. Production behavior remains unverified until both applications are deployed and the login/role matrix is tested.

### Read-only AFG AI platform bridge (source implementation)

- Added `GET /api/internal/9router/overview` as a server-to-server endpoint protected by `AFG_AI_9ROUTER_BRIDGE_TOKEN` (minimum 32 characters, constant-time digest comparison).
- The endpoint returns aggregate-only user, usage, latency, request, provider, model, integration, and feature-flag counts. It does not return user records, email addresses, provider keys, or secret values.
- The endpoint is not a browser API. 9Router calls it from its server route using a server-only bearer credential.
- Configure the same high-entropy `AFG_AI_9ROUTER_BRIDGE_TOKEN` in AFG AI and 9Router, and set `AFG_AI_ADMIN_API_URL` on 9Router to the exact HTTPS endpoint URL.
- The existing AFG AI admin API/database remains intact. This is read-only visibility only; subscription/user mutations, feature-flag changes, announcements, rate limits, sessions, security events, audit details, error export, and other app-specific controls are not migrated yet.
- No build, tests, environment changes, or deployment were run. Live behavior remains unavailable until both services receive the server-side settings and are deployed.

### AFG AI account management bridge

- Extended the private 9Router bridge with `GET /api/internal/9router/users` and `PATCH /api/internal/9router/users`.
- The user-list endpoint returns at most 250 non-deleted accounts with email, display name, role, status, last-seen timestamp, and 30-day request count; access requires a validated 9Router actor with `afg-ai:users:read` (or superadmin).
- The mutation endpoint currently supports only `active` and `suspended` status changes. It uses a transaction and the existing AFG AI admin advisory lock, refuses self-suspension, protects the last active administrator/superadmin, prevents non-superadmins from changing administrator accounts, revokes active sessions on suspension, and writes an AFG AI audit event with external actor metadata.
- 9Router supplies actor identity and scope headers only from its server-side authenticated session. The shared bridge bearer credential is never sent to browser code.
- Account role changes, account deletion, password resets, subscription management, and other AFG AI-specific controls remain out of scope until separately implemented and reviewed.

### AFG AI subscription bridge

- Added `GET /api/internal/9router/subscriptions` for active AFG AI accounts and their latest plan state, plus enabled Free/Pro plan metadata. Requires `afg-ai:subscriptions:read`.
- Added `PATCH /api/internal/9router/subscriptions` to assign only the existing `free` or `pro` plan to an active account. Requires `afg-ai:subscriptions:manage`.
- The assignment runs in a PostgreSQL transaction, cancels the previous active/trialing subscription, creates the new `admin_manual` subscription, and writes an AFG AI audit record with the external 9Router actor identity.
- This is manual plan assignment only. It does not charge a payment method, process a payment, alter plan pricing/limits, or delete subscription history.
