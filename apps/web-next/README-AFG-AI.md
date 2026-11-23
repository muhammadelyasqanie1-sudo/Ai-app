# AFG AI

**AFG AI — One AI. Many capabilities. One intelligent platform.**

AFG AI is a complete, production-ready AI platform: streaming chat with tools, vision and voice; a universal provider gateway (AFG Cloud, 9Router, Ollama, any OpenAI-compatible gateway); a full admin control plane; and native English, Dari (Persian), Pashto and Arabic with complete RTL/LTR support.

This branch (`feature/afg-ai-complete-product`) contains the complete Next.js 16 implementation of the AFG AI product — a full rewrite of the original Vite/Express prototype into a single, coherent, verified application.

---

## What is implemented (all verified end-to-end)

### AI chat platform
- Streaming responses (SSE) with **stop generation**, **regenerate**, **edit & resend**
- Conversation management: create, rename, archive/unarchive, delete, search, export (Markdown/JSON), shareable read-only links
- Model selector at the composer with capability badges (chat / coding / vision / reasoning) and live provider health
- Markdown rendering with GFM tables and syntax-highlighted code blocks with copy buttons
- File attachments: images (vision), text/CSV/JSON (inlined analysis), validated uploads with magic-byte checks
- Conversation context budget, per-conversation memory toggle and system instructions
- Web-search grounding: toggle in the composer; results are fetched live, shown in the chat with links, and used to ground the reply with citations

### Universal tools
| Tool | Endpoint | Notes |
|---|---|---|
| Web Search | `/api/tools` + chat grounding | Live results (title, URL, snippet, host, date) |
| Page Reader | `/api/tools` | Extracts readable text from a URL |
| Math Engine | `/api/tools` | Safe recursive-descent parser (no `eval`), functions + constants |
| Data Analysis | `/api/tools` | CSV parsing, numeric column statistics |
| Image Generation | `/api/images` | Text-to-image |

### Voice
- Speech-to-text: browser Web Speech API (live) and server ASR endpoint (`/api/voice`)
- Text-to-speech: server synthesis (`/api/voice`) with automatic browser `speechSynthesis` fallback
- Voice settings (enable, rate, pitch), interrupt/stop controls, honest unavailability messaging

### Providers (never fabricated)
- **AFG Cloud** — built-in provider (chat, vision, reasoning); health check performs a real backend connection
- **9Router AI Gateway** — OpenAI-compatible adapter (`/v1/models`, `/v1/chat/completions` streaming)
- **Ollama** — native adapter (`/api/tags`, `/api/chat` NDJSON streaming)
- **Custom OpenAI-compatible** providers — add via Admin → Providers
- Model discovery replaces stale catalog entries; capabilities detected from model IDs and admin-editable
- Health checks are real network calls with latency measurement; status is stored and shown in UI (`HEALTHY / DEGRADED / UNREACHABLE / DISABLED / UNKNOWN`)
- Fallback chain: preferred model first, then other healthy enabled models; every fallback is announced in the stream
- API keys are AES-256-GCM encrypted at rest and never sent to the browser (masked display only)

### Authentication & users
- Email/password (scrypt, N=16384), DB-backed sessions in httpOnly cookies
- Guest mode with upgrade-to-account (keeps history)
- Email verification and password reset with 6-digit codes — real Resend delivery when `RESEND_API_KEY` is set; in development without a mail provider the code is returned by the API and clearly labeled (never silently faked)
- Google OAuth (enabled when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are configured; shown honestly as disabled otherwise)
- Roles: USER / STAFF / ADMIN with a 12-key staff permission matrix; the first registered account bootstraps as ADMIN
- Account settings: profile, password change, session revocation on suspension/reset

### Admin control plane (every action real, authorized, audit-logged)
Dashboard (live counts, 7-day usage, top models, provider snapshot) · Users (search, role, suspend/activate, staff permissions, delete with last-admin protection) · Providers (CRUD, encrypted keys, health check, catalog refresh) · Models (enable/disable, capabilities, context window) · Usage log · Error log · Audit log · Feature flags (8 defaults) · Announcements (banner shown to users) · System health (DB latency, provider status, memory, uptime, housekeeping/pruning)

### Localization (complete RTL)
- English, Dari/Persian (fa), Pashto (ps), Arabic (ar) — 314 keys each, exact parity enforced by tests
- Full RTL/LTR via logical CSS properties; `dir`/`lang` applied to the document
- Locale preference stored per-user and in localStorage

### Security
- scrypt password hashing, constant-time comparisons, HMAC-signed share tokens
- AES-256-GCM vault (provider keys, user connector keys)
- DB-backed sliding-window rate limits (auth, chat, tools, uploads, image, voice; stricter guest limits)
- Upload validation: MIME allowlist, extension allowlist, magic-byte verification, size caps, path-traversal protection, private authenticated downloads
- Sanitized errors (internal details logged server-side, never returned), secret redaction in logs
- Audit trail for every admin action and security event

### Platform
- PWA: manifest, icons, service worker (offline shell + API cache), offline hub with storage estimate, cached conversations, airplane-mode banner
- Responsive layouts (desktop / tablet / mobile), cinematic dark + clean light themes, reduced-motion support, keyboard navigation, ARIA labels
- Housekeeping: expired session/rate-limit pruning (automatic for staff, manual for admins)

---

## Quick start

```bash
# 1. Install
bun install        # or npm install / pnpm install

# 2. Configure environment
cp .env.example .env
# generate secrets:
#   AFG_SESSION_SECRET and AFG_VAULT_KEY = base64 of 32 random bytes
#   DATABASE_URL=file:./db/custom.db

# 3. Create the database
bun run db:push

# 4. Run
bun run dev        # http://localhost:3000

# 5. Tests
bun test tests/afg-core.test.ts
```

The **first registered account becomes the platform administrator.**

## Environment variables

See `.env.example` for the full annotated list. Required: `DATABASE_URL`, `AFG_SESSION_SECRET`, `AFG_VAULT_KEY`. Optional integrations: `NINEROUTER_BASE_URL`/`NINEROUTER_API_KEY`, `OLLAMA_BASE_URL`, `OPENAI_COMPAT_*`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, `TAVILY_API_KEY` (reserved), `APP_ORIGIN`.

**Never** put provider secrets in any `VITE_*`/`NEXT_PUBLIC_*` variable. Keys live in the encrypted vault or server environment only.

## Documentation

- [CHANGELOG-AFG-AI.md](./CHANGELOG-AFG-AI.md) — complete changelog of this build
- [DEPLOYMENT-AFG-AI.md](./DEPLOYMENT-AFG-AI.md) — production deployment guide (Vercel / Node / Docker notes)
- [SECURITY-AFG-AI.md](./SECURITY-AFG-AI.md) — threat model and security decisions
- [docs/EXTERNAL_REQUIREMENTS.md](./docs/EXTERNAL_REQUIREMENTS.md) — honest list of what needs external configuration

## Architecture

```
src/
  app/
    page.tsx                      # SPA shell (client-side view routing)
    layout.tsx                    # AFG metadata, fonts, providers
    api/
      auth/[action]/              # register, login, guest, verify, reset, google, profile
      conversations/              # list/create; [id]: read/patch/delete
      chat/                       # streaming SSE chat engine
      models/                     # live model catalog
      files/                      # validated upload + private download
      tools/  images/  voice/     # universal tools, image gen, TTS/ASR
      share/[shareId]/            # public read-only shared conversations
      admin/[[...path]]/          # consolidated admin API (RBAC per section)
      health/                     # real diagnostics
  components/afg/                 # the entire frontend (shell, chat, admin, settings…)
  lib/afg/
    config.ts auth.ts crypto.ts   # secrets, sessions/RBAC, vault/passwords
    providers.ts                  # provider registry + adapters (core AI gateway)
    tools.ts rate-limit.ts        # tools, DB-backed rate limiter
    logs.ts validate.ts api.ts    # audit/error logs, zod schemas, handler wrapper
    i18n/                         # en (source), fa, ps, ar
prisma/schema.prisma              # 14 models — users → audit → providers
tests/afg-core.test.ts            # 18 automated tests (crypto, math, RBAC, i18n…)
```

## Honesty rules enforced in code

1. A configured key alone is **not** treated as a working provider — health is measured, stored, displayed.
2. No simulated success anywhere: failed streams surface the real upstream error and are logged.
3. Feature flags, email delivery, Google sign-in and voice services report their true state in the UI.
4. Chat without an available model returns an explicit error instead of a canned response.
