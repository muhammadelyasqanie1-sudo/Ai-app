import { Pool } from 'pg';

export function shouldUseDatabaseTls(connectionString?: string, sslMode?: string): boolean {
  const mode = sslMode?.trim().toLowerCase();
  if (mode === 'require') return true;
  if (mode) return false;
  try {
    const hostname = connectionString ? new URL(connectionString).hostname.toLowerCase() : '';
    return /(^|\.)supabase\.(co|com)$/.test(hostname);
  } catch {
    return false;
  }
}

const connectionString = process.env.DATABASE_URL?.trim();
const useDatabaseTls = shouldUseDatabaseTls(connectionString, process.env.DATABASE_SSL);

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
