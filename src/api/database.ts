import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();
const sslMode = process.env.DATABASE_SSL;

export const databaseConfigured = Boolean(connectionString);

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {}),
    })
  : null;

export async function checkDatabase() {
  if (!pool) return { configured: false, connected: false, message: 'DATABASE_URL is not configured' };
  try {
    await pool.query('SELECT 1');
    return { configured: true, connected: true };
  } catch {
    console.error('DATABASE_HEALTH_CHECK_FAILED');
    return { configured: true, connected: false, message: 'Database connection failed' };
  }
}
