# AFG AI — Changelog

## Version 1.0.0 — feature/afg-ai-complete-product (2026-11-21)

Complete product build: the original Vite/Express prototype was re-implemented as a single, coherent, verified Next.js 16 application. Everything below is implemented, wired end-to-end and verified in a running browser session unless explicitly marked otherwise.

### Added — platform core
- Next.js 16 (App Router, TypeScript strict) application shell replacing the Vite SPA + Express server split
- Prisma/SQLite canonical data model with 14 tables: User, Session, VerificationCode, Conversation, Message, Attachment, Provider, Model, UsageLog, ErrorLog, AuditLog, RateLimitHit, FeatureFlag, Announcement, Setting, Connector
- First-run bootstrap: default feature flags + built-in AFG Cloud model catalog; first registered account becomes ADMIN

### Added — AI chat platform
- Streaming chat engine (`POST /api/chat`, SSE) with stop (client abort persists partial output as STOPPED), regenerate, edit & resend (history truncation), and multi-model fallback chains
- Vision: image attachments route to vision-capable models via multimodal content; non-vision models are excluded from the chain when images are present
- Conversations: create, list (grouped by day), full-text search, rename, archive/unarchive, delete, per-conversation model/memory/system-prompt controls, auto-titling
- Export: Markdown and JSON; share links (HMAC-signed, revocable) with public read-only view
- Attachments: validated upload pipeline (MIME + extension + magic-byte + size), private authenticated downloads, images/thumbnails in chat, text/CSV/JSON content inlined into context
- Web-search grounding with live results displayed inline and cited by the model
- Markdown rendering (GFM tables, KaTeX-free), syntax highlighting with per-block copy buttons

### Added — providers & integrations
- Provider registry with adapters: AFG Cloud (SDK streaming + vision), OpenAI-compatible (9Router + custom), Ollama (native protocol)
- Real health checks with latency, status persistence, catalog refresh on success; catalog diffing removes vanished models
- Encrypted key vault (AES-256-GCM) + env-key bootstrap for 9Router/Ollama; masked display only
- Dynamic model catalog endpoint with capability badges and provider health

### Added — universal tools & voice
- Tools API + dispatcher: web_search, page_reader, math (safe parser, injection-proof), data_analysis (CSV stats); tool execution surfaced as stream status events
- Image generation endpoint
- Voice: server TTS/ASR endpoints; client Web Speech API with graceful fallback; voice settings; interrupt/stop

### Added — auth & security
- scrypt password hashing; DB-backed sessions (httpOnly, SameSite=Lax; secure in production); session revocation on suspension/password reset
- Guest sessions with account upgrade preserving history
- Email verification + password reset codes (hashed, expiring, single-use); Resend delivery when configured; explicit dev-mode code display otherwise (never silently simulated)
- Google OAuth flow (start + callback) gated on configuration
- AES-256-GCM vault, HMAC share tokens, DB-backed sliding-window rate limits, sanitized errors, secret redaction in audit/error logs, audit trail on all admin actions
- Upload hardening (allowlists, magic bytes, path-traversal guard)

### Added — admin control plane
- Consolidated admin API with per-section RBAC (12-key staff permission matrix)
- Sections: Dashboard (live stats), Users, Providers, Models, Usage, Errors, Audit, Feature Flags, Announcements, System Health (+ housekeeping prune)
- Last-admin protection on demotion/deletion; suspension kills sessions; protected built-in provider cannot be disabled/deleted

### Added — localization & UX
- 4 languages (en, fa/Dari, ps, ar) with exact key parity (314 keys) enforced by tests; full RTL support
- Cinematic dark + clean light themes; mobile drawer + bottom nav; keyboard navigation; ARIA labels; reduced-motion support
- Boot screen, empty states, error banners with retry, toast feedback everywhere

### Added — platform
- PWA: manifest, generated icons, service worker (shell cache, API network-first), install support
- Offline hub: cached conversations, storage estimate, clear cache, airplane-mode banner, honest on-device-runtime status
- Health endpoint with real DB round-trip; staff-triggered provider health sweep; housekeeping pruning

### Tests
- 18 automated tests (bun test): vault roundtrip + tamper rejection, scrypt, math engine (arithmetic, functions, injection rejection), CSV analysis, share-token forgery rejection, safe-user projection, DB-backed rate limiter, i18n parity + placeholder preservation

### Verified (live browser session)
Registration → admin bootstrap; streaming chat; web-search grounding with citations (Wikipedia/Britannica links); admin dashboard real stats; AFG Cloud health check → HEALTHY; Persian RTL rendering; light/dark themes; mobile 390px layout; lint + tsc clean.

### Known limitations (honest)
- SQLite via Prisma: for multi-instance production, switch the Prisma datasource to PostgreSQL (schema is portable; `db:push` on Postgres).
- On-device offline inference (WebLLM/model packs) is a desktop/Android capability; the web PWA caches conversations but cannot run local models — stated honestly in the Offline Hub.
- 9Router/Ollama show UNREACHABLE/UNKNOWN until their base URLs are configured — by design, never faked.
- Image understanding requires a vision-capable model; with only the built-in AFG Cloud catalog, the Vision variant is used.
