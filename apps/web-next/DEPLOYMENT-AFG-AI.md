# AFG AI — Deployment Guide

## Requirements
- Node.js 20+ (or Bun 1.3+)
- A persistent filesystem for the SQLite database (or a PostgreSQL database for scaled deployments)

## 1. Environment
Copy `.env.example` → `.env` and set:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | `file:./db/custom.db` (SQLite) or PostgreSQL URL |
| `AFG_SESSION_SECRET` | Yes | base64 of 32 random bytes — session/HMAC signing |
| `AFG_VAULT_KEY` | Yes | base64 of 32 random bytes — AES-256-GCM credential vault |
| `APP_ORIGIN` | Prod | Canonical HTTPS origin (used for OAuth redirects) |
| `NINEROUTER_BASE_URL` / `NINEROUTER_API_KEY` | No | 9Router AI Gateway |
| `OLLAMA_BASE_URL` | No | Ollama server (e.g. `http://127.0.0.1:11434`) |
| `OPENAI_COMPAT_BASE_URL` / `OPENAI_COMPAT_API_KEY` | No | Generic OpenAI-compatible provider |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Google sign-in (redirect: `https://YOUR_APP_ORIGIN/api/auth/google-callback`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | No | Real email delivery for verification/reset codes |
| `AFG_ALLOW_DEV_CODES` | No | `false` in production — prevents dev-mode code display |
| `AFG_UPLOAD_DIR` | No | Private upload storage (default `db/uploads`) |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 2. Install & migrate
```bash
bun install          # or npm install
bun run db:push      # creates/updates the database schema
```

## 3. Run

### Development
```bash
bun run dev          # http://localhost:3000
```

### Production (Node standalone)
```bash
bun run build
bun run start        # serves the standalone Next.js server
```

### Production (Docker sketch)
```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
ENV NODE_ENV=production DATABASE_URL=file:/data/custom.db
VOLUME /data
CMD ["bun", ".next/standalone/server.js"]
```

## 4. PostgreSQL (recommended for scale)
1. Point `DATABASE_URL` at your Postgres instance.
2. In `prisma/schema.prisma` change `provider = "sqlite"` → `provider = "postgresql"`.
3. `bun run db:push`.
The schema uses only portable types; the rate limiter and sessions then work correctly across multiple instances.

## 5. First run checklist
1. Open the app, **register the first account** — it becomes ADMIN automatically.
2. Admin → Providers → **Check health** on each provider; verify models were discovered.
3. Admin → Feature flags — confirm the capabilities you want enabled.
4. Admin → Announcements — publish an onboarding banner if desired.
5. Set `AFG_ALLOW_DEV_CODES=false` and configure `RESEND_API_KEY` for real email delivery.

## 6. Operational notes
- Back up the database file (and `db/uploads/`) regularly; all state lives there.
- Session cookies are `httpOnly` + `SameSite=Lax`; enable HTTPS and set `APP_ORIGIN=https://…` so cookies are marked `Secure`.
- Rate limits are DB-backed; with SQLite they apply per-database (single instance). With Postgres they apply platform-wide.
- The service worker activates in production builds only (`NODE_ENV=production`); bump `CACHE` name in `public/sw.js` when shipping static asset changes.
- Health endpoint: `GET /api/health` (staff session unlocks provider checks + housekeeping).
