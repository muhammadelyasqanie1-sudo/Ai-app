import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
/** Compare the applied ledger with checked-in migrations; never apply changes here. */
export async function migrationStatus(pool: Pool) {
  const directory = new URL('../../database/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name));
  const table = await pool.query("SELECT to_regclass('public.schema_migrations') AS ledger");
  if (!table.rows[0].ledger) return { ready: false, pending: files.length, modified: 0 };
  const rows = await pool.query('SELECT version,checksum FROM schema_migrations');
  const applied = new Map(rows.rows.map(row => [row.version, row.checksum]));
  let pending = 0; let modified = 0;
  for (const name of files) {
    if (!applied.has(name)) { pending++; continue; }
    const checksum = createHash('sha256').update(await readFile(new URL(name, directory))).digest('hex');
    if (applied.get(name) !== checksum) modified++;
  }
  return { ready: pending === 0 && modified === 0, pending, modified };
}
