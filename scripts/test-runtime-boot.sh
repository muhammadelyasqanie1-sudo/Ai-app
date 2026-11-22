#!/usr/bin/env bash
# Boot-verify the production runtime path exactly as the Dockerfile does:
# migrations on start, tsx server.ts, /api/health, static dist serving.
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_ENV=production
export PORT=3111
export APP_ORIGIN=https://afg-ai-test.example.com
export PROVIDER_KEYS_MASTER_KEY="${PROVIDER_KEYS_MASTER_KEY:-dGVzdC1tYXN0ZXIta2V5LWJhc2U2NC0zMmJ5dGVzLWhvbmVzdA==}"
export DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/afg_agent_test'

node - <<'EOF' > /tmp/afg-pg-daemon.log 2>&1 &
const Postgres = require('embedded-postgres').default;
(async () => {
  const pg = new Postgres({
    databaseDir: '/tmp/afg-pgdata',
    user: 'postgres', password: 'postgres', port: 55432, persistent: false,
    onLog: () => {}, onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  console.log('PG_READY');
  setInterval(() => {}, 60000);
})().catch((e) => { console.error('PG_FAIL', e.message); process.exit(1); });
EOF
PG_PID=$!
cleanup() { kill "$PG_PID" 2>/dev/null || true; kill "$SRV_PID" 2>/dev/null || true; pkill -f afg-pgdata 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 60); do
  grep -q PG_READY /tmp/afg-pg-daemon.log 2>/dev/null && break
  grep -q PG_FAIL /tmp/afg-pg-daemon.log 2>/dev/null && { cat /tmp/afg-pg-daemon.log; exit 1; }
  sleep 1
done

node - <<'EOF'
const { Client } = require('pg');
(async () => {
  const admin = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:55432/postgres' });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS afg_agent_test');
  await admin.query('CREATE DATABASE afg_agent_test');
  await admin.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
EOF

echo "== migrations (boot step, as in Dockerfile CMD)"
./node_modules/.bin/tsx scripts/migrate.ts > /tmp/afg-migrate.log 2>&1 || { tail -5 /tmp/afg-migrate.log; exit 1; }
tail -1 /tmp/afg-migrate.log

echo "== boot server.ts (tsx, production env)"
./node_modules/.bin/tsx server.ts > /tmp/afg-server.log 2>&1 &
SRV_PID=$!
for i in $(seq 1 45); do
  grep -q SERVER_LISTENING /tmp/afg-server.log 2>/dev/null && break
  sleep 1
done
grep -q SERVER_LISTENING /tmp/afg-server.log || { cat /tmp/afg-server.log; exit 1; }

echo "== /api/health"
# Direct HTTP must 308-redirect to the canonical HTTPS origin in production.
DIRECT=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3111/api/health)
echo "GET http://.../api/health -> $DIRECT (expect 308 HTTPS redirect)"
[ "$DIRECT" = "308" ] || { cat /tmp/afg-server.log; exit 1; }
# Behind the TLS terminator the proxy sets X-Forwarded-Proto: https.
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3111/api/health)
echo "GET /api/health (X-Forwarded-Proto: https) -> $HEALTH"
[ "$HEALTH" = "200" ] || { cat /tmp/afg-server.log; exit 1; }

echo "== static dist serving"
INDEX=$(curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3111/)
echo "GET / -> $INDEX"
[ "$INDEX" = "200" ] || { cat /tmp/afg-server.log; exit 1; }
curl -s -H 'X-Forwarded-Proto: https' http://127.0.0.1:3111/ | grep -q "root" || { echo "index.html missing mount point"; exit 1; }

echo "== security headers in production"
HEADERS=$(curl -s -D - -o /dev/null -H 'X-Forwarded-Proto: https' http://127.0.0.1:3111/api/health)
echo "$HEADERS" | grep -qi "Content-Security-Policy" && echo "CSP header present"
echo "$HEADERS" | grep -qi "Strict-Transport-Security" && echo "HSTS header present"

echo "RUNTIME_BOOT_VERIFICATION_PASSED"
