#!/usr/bin/env bash
# Run the PostgreSQL integration tests against a disposable user-space
# PostgreSQL 18 instance (no root, no Docker required).
# Usage: bash scripts/run-integration-tests.sh [test-file...]
#   default: scripts/test-conversation-isolation.ts
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/postgres'
PGDATA=/tmp/afg-pgdata
TESTS=("$@")

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
PG_DAEMON_PID=$!

cleanup() {
  kill "$PG_DAEMON_PID" 2>/dev/null || true
  pkill -f "afg-pgdata" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 60); do
  if grep -q PG_READY /tmp/afg-pg-daemon.log 2>/dev/null; then break; fi
  if grep -q PG_FAIL /tmp/afg-pg-daemon.log 2>/dev/null; then
    cat /tmp/afg-pg-daemon.log; exit 1
  fi
  sleep 1
done
grep -q PG_READY /tmp/afg-pg-daemon.log || { cat /tmp/afg-pg-daemon.log; exit 1; }
echo "embedded PostgreSQL ready on 127.0.0.1:55432"

npx tsx scripts/migrate.ts
echo "migrations applied"

if [ "${#TESTS[@]}" -eq 0 ]; then
  TESTS=(scripts/test-conversation-isolation.ts)
fi
for test in "${TESTS[@]}"; do
  echo "== $test"
  npx tsx "$test"
done
echo "ALL_INTEGRATION_TESTS_PASSED"
