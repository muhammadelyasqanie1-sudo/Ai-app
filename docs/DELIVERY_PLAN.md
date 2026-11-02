# AFG AI phased delivery plan

This plan defines release gates, not a claim that every feature currently exists. A phase is **shippable** only after its complete user path works from UI through API/provider and persistence, with authorization, validation, loading/empty/error states and recovery behavior. Existing capabilities remain in place while later phases are added. Every feature must also pass the [mandatory acceptance criteria](./ACCEPTANCE_CRITERIA.md); otherwise it must be reported as **Incomplete** or **Blocked** with exact gaps.

## Release policy
- Do not start a later phase by silently weakening an earlier phase.
- No fake users, fake provider responses, placeholder model availability or simulated success.
- Capability-gate features when the configured provider cannot perform them.
- Preserve existing Render/Vite and Android/Capacitor paths until a complete migration is ready.
- Database migrations are additive and run explicitly; never assume a migration has been applied.
- Tests, builds and deployments are run only when explicitly requested by the project owner.

## Phase 1 — Foundation (release blocker)
Scope:
- Authentication, secure sessions and account authorization.
- Versioned database migrations and health/readiness checks.
- Provider gateway with Cloudflare Workers AI and one OpenAI-compatible adapter.
- Live model discovery and health verification; no fabricated model entries.
- Streaming chat with request IDs, cancellation, retry classification and safe error handling.
- Conversation and message CRUD, scoped to the authenticated owner.
- i18n scaffold, mandatory first-launch language selection and locale persistence.
- Base theme system.

Current implementation evidence:
- Auth/session APIs and PostgreSQL migrations exist.
- Cloudflare Workers AI and OpenAI-compatible adapters are registered in one provider gateway; catalog discovery and health checks are present.
- Streaming chat, request IDs, error classification and cancellation handling exist.
- Locale dictionaries, first-launch language selector, persisted locale endpoint and theme preferences exist.
- Conversation schema already existed; owner-scoped CRUD routes were added at `/api/conversations` and `/api/conversations/:id/messages`.

**Phase 1 status: API and platform foundation substantially implemented; NOT RELEASE-READY.** The current History view still reads/writes browser localStorage and is not yet connected to conversation CRUD. The chat send/stream flow also needs to persist and restore messages against a server conversation. Therefore conversation CRUD is not yet end-to-end in the UI. The language selector currently supports Dari and English only, and legacy UI areas still need complete translation coverage. Database migrations have not been executed as part of this work.

Exit gate:
1. Sign up/sign in, session refresh/expiry and sign out work against the configured database.
2. User can create, list, open, rename, archive and delete conversations across devices.
3. Messages persist and reload; one user's IDs never reveal another user's records.
4. Cloudflare and OpenAI-compatible models are discovered and health-verified; unavailable providers produce clear errors.
5. Streaming, abort, timeout, provider error, quota/rate limit and retry paths are handled without duplicate messages.
6. First launch blocks until a language is selected; locale persists across auth and devices.
7. Existing theme and navigation behavior does not regress.

## Phase 2 — Core AI Experience
Scope:
- Edit, regenerate, stop, retry and message-level operations.
- Markdown rendering, code highlighting and copy actions.
- Auto model selection and verified-model fallback controls.
- Explicit opt-in memory with inspect/delete controls.
- Central settings center.
- Secure file upload, extraction and document Q&A.

Known state: Markdown/highlighting, provider fallback, memory preferences, settings, upload security helpers and file-assistant capability reporting are present in parts. End-to-end coverage varies; upload helper is not yet fully wired to an authenticated upload/quarantine/scanning pipeline, and document Q&A must be capability-gated. Do not mark the phase complete until each workflow is connected to persistent data and handles failures.

Exit gate: each operation is usable from the UI, authorized by the API, persisted where appropriate, and recoverable after refresh or network/provider failure.

## Phase 3 — Creative & Productivity
Scope:
- Image generation studio and persistent generation history.
- Vision analysis and OCR.
- Writing templates and reusable drafts.
- Translation workspace.
- Productivity Center tools.

Known state: Productivity APIs and UI tools exist; research, translation and voice-adjacent routes are present. Image/vision capabilities depend on verified provider support and must not display enabled controls when no compatible provider is configured.

Exit gate: every tool has a real provider or deterministic local implementation, persisted outputs/history where applicable, capability checks, quotas and safe error states.

## Phase 4 — Admin & Hardening
Scope:
- Admin dashboard for users, providers, models, usage, errors and audit.
- Distributed rate limiting and feature flags.
- Security, performance and accessibility passes.

Known state: admin APIs/panel, feature flags, rate-limit policy/counter tables, audit/security events and request telemetry are present. A complete release still requires a route-by-route authorization/ownership review, abuse testing, accessibility audit and production performance review.

Exit gate: privileged actions are server-authorized, audited and tested; rate limits cannot be bypassed by client-supplied headers; security and accessibility findings are resolved or explicitly accepted.

## Phase 5 — Optional / Capability-Gated
Scope:
- Voice transcription and synthesis.
- Web research only when a search provider is configured.
- Image editing.
- Phone verification.
- Notification delivery.

Known state: voice and research routes exist but availability is provider/configuration dependent. Image editing, phone verification and notification delivery must remain disabled until complete provider/delivery integrations and consent flows exist.

Exit gate: feature capability is verified at runtime; secrets remain server-side; consent, quotas, retention and provider failure behavior are implemented.

## Current next milestone
Finish the Phase 1 UI integration: replace local-only History persistence with the authenticated conversation API, create/restore the active conversation in the chat flow, persist user/assistant messages, and handle offline/unauthenticated states without losing the unsent draft. Then verify the Phase 1 exit gate before calling Phase 1 shipped.
