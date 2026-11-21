import { migrationStatus } from './migrationStatus.ts';
import { Pool, Client } from 'pg';
import { shouldUseDatabaseTls } from './databaseTls.ts';
export { shouldUseDatabaseTls } from './databaseTls.ts';

const configuredUrl = process.env.DATABASE_URL?.trim();
let validUrl = false;
try { const url = new URL(configuredUrl || ''); validUrl = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname); } catch { /* Report invalid configuration without logging secrets. */ }
const connectionString = validUrl ? configuredUrl : undefined;
const requestedPoolMax = Number(process.env.DATABASE_POOL_MAX || 5);
const poolMax = Number.isInteger(requestedPoolMax) && requestedPoolMax >= 1 && requestedPoolMax <= 100 ? requestedPoolMax : 5;
const useDatabaseTls = shouldUseDatabaseTls(connectionString, process.env.DATABASE_SSL);
const databaseSslCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim();

export const databaseConfigured = Boolean(configuredUrl);

let databaseConnectionAnnounced = false;
// Truthful connection banner: the log must reflect the actual configured host.
// Never log the full URL (it can embed credentials); the hostname alone is safe.
function databaseConnectionLabel(): string {
  try {
    const host = new URL(connectionString || '').hostname;
    return host ? `SUCCESS DATABASE_CONNECTED host=${host}` : 'SUCCESS DATABASE_CONNECTED';
  } catch {
    return 'SUCCESS DATABASE_CONNECTED';
  }
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: poolMax,
      statement_timeout: 15_000,
      query_timeout: 20_000,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...(useDatabaseTls
        ? {
            ssl: {
              rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
              ...(databaseSslCa ? { ca: databaseSslCa } : {}),
            },
          }
        : {}),
    })
  : null;

pool?.on('error', () => { console.error('DATABASE_IDLE_CONNECTION_ERROR'); });

/**
 * Dedicated (non-pooled) client built from the same validated configuration
 * as the pool. Used by the live event hub for LISTEN/NOTIFY: a LISTEN lease
 * must never be returned to the pool, so it cannot use a pooled client.
 */
export function createDedicatedDatabaseClient(): Client | null {
  if (!connectionString) return null;
  return new Client({
    connectionString,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    connectionTimeoutMillis: 5_000,
    ...(useDatabaseTls
      ? {
          ssl: {
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
            ...(databaseSslCa ? { ca: databaseSslCa } : {}),
          },
        }
      : {}),
  });
}

export async function checkDatabase() {
  if (!pool) return { configured: Boolean(configuredUrl), connected: false, message: configuredUrl ? 'DATABASE_URL is invalid' : 'DATABASE_URL is not configured' };
  try {
    await pool.query('SELECT 1');
    if (!databaseConnectionAnnounced) {
      console.info(databaseConnectionLabel());
      databaseConnectionAnnounced = true;
    }
    const migrations = await migrationStatus(pool);
    return { configured: true, connected: true, schemaReady: migrations.ready, migrations };
  } catch {
    console.error('DATABASE_HEALTH_CHECK_FAILED');
    return { configured: true, connected: false, message: 'Database connection failed' };
  }
}
