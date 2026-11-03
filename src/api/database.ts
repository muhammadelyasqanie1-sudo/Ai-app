import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();
const sslMode = process.env.DATABASE_SSL?.trim().toLowerCase();
let databaseHostname = '';
try { databaseHostname = connectionString ? new URL(connectionString).hostname.toLowerCase() : ''; } catch { /* pg reports malformed connection strings through the health check. */ }
const isSupabasePostgres = /(^|\\.)supabase\\.(co|com)$/.test(databaseHostname);
// Supabase Postgres requires TLS. Local and non-Supabase connections remain configurable.
const useDatabaseTls = sslMode === 'require' || (!sslMode && isSupabasePostgres);

export const databaseConfigured = Boolean(connectionString);

let databaseConnectionAnnounced = false;

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...(useDatabaseTls ? { ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {}),
    })
  : null;

export async function checkDatabase() {
  if (!pool) return { configured: false, connected: false, message: 'DATABASE_URL is not configured' };
  try {
    await pool.query('SELECT 1');
    if (!databaseConnectionAnnounced) {
      console.info('SUCCESS SUPABASE_DATABASE_CONNECTED');
      databaseConnectionAnnounced = true;
    }
    return { configured: true, connected: true };
  } catch {
    console.error('DATABASE_HEALTH_CHECK_FAILED');
    return { configured: true, connected: false, message: 'Database connection failed' };
  }
}
