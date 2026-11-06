import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { shouldUseDatabaseTls } from '../src/api/databaseTls.ts';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exitCode = 1;
} else {
  const useDatabaseTls = shouldUseDatabaseTls(connectionString, process.env.DATABASE_SSL);
  const databaseSslCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim();
  const pool = new Pool({
    connectionString,
    max: 1,
    ...(useDatabaseTls
      ? {
          ssl: {
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
            ...(databaseSslCa ? { ca: databaseSslCa } : {}),
          },
        }
      : {}),
  });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const directory = path.join(here, '..', 'database', 'migrations');
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await pool.query('SELECT checksum FROM schema_migrations WHERE version=$1', [name]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration was modified: ' + name + '. Create a new migration instead.');
        console.info('SKIP ' + name);
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [name, checksum]);
        await client.query('COMMIT');
        console.info('APPLIED ' + name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    console.info('Database migrations are up to date.');
  } catch (error) {
    console.error('DATABASE_MIGRATION_FAILED', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
