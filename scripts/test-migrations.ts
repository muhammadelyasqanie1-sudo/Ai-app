import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Early-warning check for the migration ledger:
 *  1. reports duplicate migration numbers (must not grow beyond the eight
 *     legacy pairs documented in database/MIGRATIONS.md);
 *  2. verifies every applied checksum referenced by code/docs is stable —
 *     here we assert that no migration file contains destructive statements
 *     (DROP TABLE/DROP COLUMN/DELETE FROM without WHERE) that would silently
 *     destroy production data on fresh installs.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.join(here, '..', 'database', 'migrations');
const files = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();

assert.ok(files.length > 50, 'migration set unexpectedly small');

const numbers = files.map((name) => name.split('_')[0]);
const duplicates: Record<string, string[]> = {};
for (let i = 0; i < files.length; i++) {
  (duplicates[numbers[i]] ||= []).push(files[i]);
}
const duplicateNumbers = Object.entries(duplicates).filter(([, list]) => list.length > 1);
// The eight legacy duplicate pairs are frozen and documented; guard against new ones.
const LEGACY_DUPLICATES = new Set(['0003', '0004', '0005', '0006', '0007', '0013', '0014', '0034']);
const newDuplicates = duplicateNumbers.filter(([number]) => !LEGACY_DUPLICATES.has(number));
assert.deepEqual(newDuplicates, [], 'new duplicate migration numbers must not be introduced: ' + newDuplicates.map(([n, list]) => n + ':' + list.join(',')).join('; '));

// Unique checksums: two different files must never be byte-identical.
const checksums = new Map<string, string>();
for (const name of files) {
  const checksum = createHash('sha256').update(await readFile(path.join(directory, name), 'utf8')).digest('hex');
  const owner = checksums.get(checksum);
  assert.ok(!owner, 'migrations ' + owner + ' and ' + name + ' are byte-identical');
  checksums.set(checksum, name);
}

// Destructive statements: allowed only in the documented legacy provider-removal
// migrations (they delete discontinued provider rows from registry tables, are
// already applied everywhere and never run again on an existing ledger).
const destructive: string[] = [];
const tableDrops: string[] = [];
for (const name of files) {
  const sql = (await readFile(path.join(directory, name), 'utf8')).toUpperCase();
  if (/DROP\s+(TABLE|COLUMN|DATABASE|SCHEMA)\b/.test(sql) || /\bDELETE\s+FROM\b/.test(sql) || /\bTRUNCATE\b/.test(sql)) {
    destructive.push(name);
  }
  if (/DROP\s+TABLE\b/.test(sql)) tableDrops.push(name);
}
console.log('migration files:', files.length);
console.log('legacy duplicate numbers (frozen):', duplicateNumbers.map(([n]) => n).join(', '));
console.log('files containing destructive statements (reviewed):', destructive.join(', ') || 'none');
const DOCUMENTED_PROVIDER_REMOVALS = new Set([
  '0011_remove_cloudflare_workers_ai.sql',
  '0018_remove_iteracompute_qwen3.sql',
  '0020_remove_iteracompute_provider.sql',
  '0021_keep_only_9router_and_ollama.sql',
]);
assert.ok(destructive.every((name) => DOCUMENTED_PROVIDER_REMOVALS.has(name)),
  'unexpected destructive migration — review before merging: ' + destructive.filter((name) => !DOCUMENTED_PROVIDER_REMOVALS.has(name)).join(', '));
assert.deepEqual(tableDrops, [], 'no migration may drop a table');
console.log('Migration ledger hygiene check passed.');
