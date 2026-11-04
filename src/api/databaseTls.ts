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
