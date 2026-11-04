import assert from 'node:assert/strict';
import { shouldUseDatabaseTls } from '../src/api/databaseTls.ts';

assert.equal(
  shouldUseDatabaseTls('postgresql://user:pass@db.qasnhpozreaqfbdgbsbg.supabase.co:5432/postgres'),
  true,
  'Supabase direct connections must enable TLS by default',
);
assert.equal(
  shouldUseDatabaseTls('postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'),
  true,
  'Supabase pooler connections must enable TLS by default',
);
assert.equal(
  shouldUseDatabaseTls('postgresql://user:pass@localhost:5432/afg'),
  false,
  'Local PostgreSQL should remain configurable when TLS mode is unset',
);
assert.equal(
  shouldUseDatabaseTls('postgresql://user:pass@db.example.com:5432/app', 'require'),
  true,
  'Explicit require mode must enable TLS for any PostgreSQL host',
);
assert.equal(
  shouldUseDatabaseTls('postgresql://user:pass@db.project.supabase.co:5432/postgres', 'disable'),
  false,
  'An explicit non-require mode must be respected',
);
assert.equal(shouldUseDatabaseTls('not-a-url'), false, 'Invalid URLs must not be treated as Supabase hosts');

console.info('DATABASE_TLS_POLICY_TESTS_PASSED');
