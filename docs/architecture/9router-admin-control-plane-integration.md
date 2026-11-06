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
