# AFG AI production image.
#
# The runtime serves the API (server.ts, executed with tsx) and the static
# Vite build from dist/. Database migrations are checksum-guarded, advisory
# locked and idempotent, so running them on every boot is safe and required
# for first deployment.
#
# Build:  docker build -t afg-ai .
# Run:    docker run --rm -p 3000:3000 --env-file .env afg-ai
#         (.env must provide DATABASE_URL, PROVIDER_KEYS_MASTER_KEY and
#          APP_ORIGIN; see .env.example for the complete honest list.)

# ---- build stage: install toolchain, validate locales, build web assets ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime stage: production dependencies only, non-root, no build tools --
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY src ./src
COPY packages ./packages
# server.ts boots scripts/programming-knowledge-scheduler.ts and boot runs
# scripts/migrate.ts, so the whole scripts directory is required at runtime.
COPY scripts ./scripts
COPY database ./database
USER node
EXPOSE 3000
# tsx is a production dependency (it executes server.ts in production).
CMD ["sh", "-c", "./node_modules/.bin/tsx scripts/migrate.ts && exec ./node_modules/.bin/tsx server.ts"]
