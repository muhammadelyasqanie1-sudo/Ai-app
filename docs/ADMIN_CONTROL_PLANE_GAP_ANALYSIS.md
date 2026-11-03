# AFG AI Admin Control Plane — Gap Analysis

Repository reviewed: `muhammadelyasqanie1-sudo/Ai-app`, branch baseline `main`.

## Existing foundation

- The application already mounts `AfgAdminPanel` from `src/App.tsx`.
- `src/api/adminHandler.ts` already provides administrator login-dependent routes for users, subscriptions, overview metrics, request telemetry, audit events, security events, rate limits, feature flags, provider toggles/tests, model settings/discovery, fallback chains, system health, and product-update notifications.
- `src/services/providerGateway.ts` already has adapters for Cloudflare Workers AI, one environment-configured OpenAI-compatible provider, and the GPT-OSS proxy.
- The provider adapters perform server-side model listing and model health checks. The user-facing catalog filters for enabled, recently verified models.
- PostgreSQL migrations already define `provider_configs`, `model_catalog`, `usage_events`, `audit_logs`, `feature_flags`, `rate_limit_policies`, `security_events`, and `admin_request_events`.
- The admin UI has working data-loading and mutation paths for its current tabs; it is not merely a static mockup.

## Critical gaps against the requested specification

### Provider control plane
- The provider database catalog is now seeded with Cloudflare Workers AI, DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter, and local Ollama. The runtime adapter registry still has only Cloudflare Workers AI, one configurable OpenAI-compatible endpoint, and GPT-OSS proxy.
- DeepSeek, first-party OpenAI, Anthropic, Gemini, OpenRouter, and desktop-local Ollama do not have dedicated adapters in the registry.
- A new migration adds normalized provider slugs, base URLs, non-secret configuration, source markers, and idempotent seeds. A read-only provider inventory endpoint and custom-provider registration endpoint were added. The UI and runtime execution/discovery for arbitrary custom providers are still missing.
- Provider testing currently validates configuration and model listing; it does not consistently execute a generation request against a selected model.
- The schema now includes an encrypted multi-key `provider_keys` table, but encryption/decryption services, key-management APIs, key rotation, and superadmin-only authorization are not implemented.

### Model inventory and verification
- Discovery is currently invoked globally, not per provider.
- Cloudflare discovery requests only one page (`per_page=100`); it does not paginate to prove a complete inventory.
- The Gemini-compatible adapter intentionally filters the returned list to two hard-coded IDs; this is not full model discovery.
- GPT-OSS proxy discovery intentionally limits results to two IDs.
- Newly discovered rows were being inserted with `enabled=true`. This branch changes new discoveries to `enabled=false`; existing administrator choices are preserved.
- Model health checks are adapter-specific. The OpenAI-compatible adapter uses a model metadata GET rather than a one-token generation request, so it does not prove inference works.
- Health freshness currently uses a five-minute in-memory cache (stricter than the requested 24-hour maximum), but it is process-local and not a durable provider/model health scheduler.

### Roles and security
- Admin APIs currently accept only role `admin`; there is no `superadmin` distinction or key-management authorization boundary.
- The current user-role mutation accepts `user` and `admin` only.
- Admin API method allow-list currently excludes DELETE and PUT, so the requested resource-oriented API surface is not implemented.
- Existing CSRF checks and distributed rate-limit infrastructure are present, but an explicit admin-specific 100 requests/minute policy is not implemented here.
- Audit events are recorded for many current mutations, but the requested immutable INSERT-only audit guarantee and before/after snapshots are not fully demonstrated by the current handler.
- No provider-key encryption vault exists; therefore no key rotation workflow can be claimed.
- No complete session inventory/revocation admin API, forced re-authentication for sensitive operations, or explicit admin API abuse dashboard exists.

### Operations and observability
- Overview data is based on existing usage/request/user/storage tables, but today's cost, provider cost breakdown, latency percentiles, and all requested chart series are not complete.
- There is request telemetry and security-event capture, but no dedicated redacted `error_logs` pipeline with error classes and CSV export.
- There is no recurring-model-error detector or daily-cost email alert workflow.
- Health currently checks PostgreSQL and provider catalog reachability. Queue state is honestly reported as not configured; object-storage byte usage, app version, and migration version are not fully reported.
- Announcements currently use opted-in in-app notifications; the requested home-screen announcement management/list API is not complete.

## Work started on this branch

- `src/services/providerGateway.ts`: new model discoveries are inserted disabled by default. Existing rows retain their administrator-selected enabled state.
- `database/migrations/0003_provider_control_plane.sql`: adds provider catalog metadata, custom-provider-capable schema, encrypted-key table structure, model metadata fields, seven idempotently seeded built-in providers, five disabled/unverified DeepSeek model catalog entries, and append-only audit mutation trigger.
- `src/api/adminHandler.ts`: adds provider inventory read API and validated custom-provider registration API with audit event. This removes the unsafe implicit enablement path.

## Implementation order

1. Wire the seeded provider catalog into the UI and runtime; implement dedicated adapters for the requested providers and arbitrary custom OpenAI-compatible endpoints.
2. Add per-provider complete discovery with pagination, upsert metadata, default-disabled semantics, and explicit discovery audit events.
3. Add durable per-model inference probes and enforce the 24-hour verification predicate in every user-facing catalog path.
4. Add role migration and RBAC with `user`, `admin`, and `superadmin`; add immutable audit enforcement.
5. Add server-side encrypted provider-key storage and rotation. Keys must never be returned or logged.
6. Add redacted error telemetry, usage/cost analytics, session controls, config/announcement APIs, and the remaining operational UI.

## Verification status

No tests, builds, migrations, or deployments were run. This review is based on repository source inspection only. Database behavior, live provider availability, and production UI behavior remain unverified.
