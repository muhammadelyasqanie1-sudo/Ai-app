# AFG AI acceptance criteria — definition of complete

This document is the mandatory definition of **complete** for every feature and release. A feature must satisfy **all ten** criteria below. Passing only the UI or API portion is not completion.

## Universal acceptance checklist

For each feature, record evidence for every item:

1. **Localized, responsive UI** — The complete user-facing workflow exists, is responsive on mobile and desktop, and is translated in both English and Dari (FA/RTL). Language selection must not leave mixed-language labels.
2. **Capability-aware UI** — If the required provider/model capability is unavailable or not configured, the relevant control is disabled and explains why. Do not simulate success or advertise unsupported capabilities.
3. **Validated, authorized backend** — A backend route exists where needed; it validates inputs, authenticates the caller, enforces role and resource ownership, and applies appropriate per-IP/per-user/per-feature rate limits.
4. **Provider gateway only** — All external AI provider calls pass through the server-side provider gateway. No browser/client-to-provider calls, embedded credentials, or feature-specific bypass adapters.
5. **Persistence** — Successful outputs and relevant operation metadata are persisted in the database when applicable. Refresh/reopen behavior must match the feature's persistence contract. If persistence is genuinely inapplicable, document why.
6. **Structured errors and request IDs** — Success and failure responses use the documented structured contract. Failures expose a request/correlation ID without leaking secrets, stack traces, or upstream sensitive bodies.
7. **Structured observability** — Emit a structured log event for both success and failure, including request ID, feature/action, outcome, duration where available, and safe user/resource identifiers. Never log secrets or raw sensitive content.
8. **Admin controls** — Where relevant, authorized admins can enable/disable and configure the feature, provider/model availability, limits and policy. Admin changes are enforced server-side and audited. If no admin control is relevant, record the reason.
9. **Documentation** — Update the relevant feature/API/provider/configuration docs, environment variable examples, migration notes and operational guidance.
10. **Production hygiene** — No hardcoded secrets, fake data, simulated provider results, placeholder success paths, dead buttons or unhandled critical paths. Loading, empty, disabled, success and failure states must be meaningful.

## Status rules

- **Complete:** all ten items pass, with implementation evidence recorded.
- **Incomplete:** one or more items are missing, unverified, or only partially implemented. List each failed item and its exact gap.
- **Blocked:** implementation cannot proceed because a required provider, credential, external service, migration, permission or product decision is unavailable. State the blocker and the disabled/capability-gated behavior.
- **Not applicable:** allowed only for an individual criterion when the feature genuinely does not need it; include a short reason and reviewer evidence. It does not waive other criteria.

Do not infer completion from a file existing, a button rendering, an API returning HTTP 200, or a provider being listed in configuration. Verify the full user journey and its failure paths. Do not claim a criterion is verified unless the relevant checks were actually performed.

## Required feature acceptance record

Maintain one record per feature in the delivery plan or a linked feature checklist:

| Field | Required evidence |
|---|---|
| Feature and owner | Stable feature name and responsible area |
| Status | Complete / Incomplete / Blocked |
| UI and localization | Screens/routes and EN + Dari coverage |
| Capability gating | Provider/model capability and disabled explanation |
| API security | Route, schema, auth, ownership and rate-limit enforcement |
| Gateway | Gateway method and provider adapter used |
| Persistence | Tables/records and reload behavior, or N/A reason |
| Errors and request IDs | Structured response examples and correlation behavior |
| Logs | Success/failure event names and safe fields |
| Admin | Admin setting, authorization and audit, or N/A reason |
| Documentation | Updated paths |
| Remaining gaps | Exact unmet criteria and next action |

## Final report rule

Every implementation report must explicitly state the feature status. If anything is missing, report **Incomplete** and name the exact numbered criterion, the missing implementation, and the next action. Never describe a partially implemented feature as finished. State separately whether tests, builds, migrations and deployment were run; do not imply verification when they were not run.

## Project-wide application

These criteria apply to existing and new features, including authentication, chat, conversations/history, model selection, file handling, image and vision tools, voice, translation, productivity tools, admin controls, billing and notifications. Capability-dependent features must remain disabled with an explanation until the full workflow is ready.
