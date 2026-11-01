import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  defaultModel: string | null;
}

function cookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function setSessionCookies(res: ServerResponse, sessionToken: string, csrfToken: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `afg_session=${encodeURIComponent(sessionToken)}; ${cookieOptions()}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    `afg_csrf=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax${secure}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]);
}

export function clearSessionCookies(res: ServerResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `afg_session=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`,
    `afg_csrf=; Path=/; SameSite=Lax${secure}; Max-Age=0`,
  ]);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function authenticateRequest(req: IncomingMessage): Promise<AuthenticatedUser | null> {
  if (!pool) return null;
  const sessionToken = cookies(req).afg_session;
  if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256) return null;
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status, u.default_model
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'
      LIMIT 1`,
    [hash(sessionToken)],
  );
  const row = result.rows[0];
  if (!row) return null;
  void pool.query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [hash(sessionToken)]).catch(() => {});
  return {
    id: row.id,
    email: row.email || '',
    displayName: row.display_name || '',
    role: row.role === 'admin' ? 'admin' : 'user',
    status: row.status,
    defaultModel: row.default_model || null,
  };
}

export function verifyCsrf(req: IncomingMessage): boolean {
  const jar = cookies(req);
  const header = req.headers['x-csrf-token'];
  if (!jar.afg_csrf || typeof header !== 'string' || jar.afg_csrf.length < 32 || header.length !== jar.afg_csrf.length) return false;
  return timingSafeEqual(Buffer.from(jar.afg_csrf), Buffer.from(header));
}

export async function createSession(userId: string, res: ServerResponse): Promise<void> {
  if (!pool) throw new Error('Database is not configured.');
  const sessionToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash(sessionToken), expiresAt],
  );
  setSessionCookies(res, sessionToken, csrfToken);
}

export async function destroySession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (pool) {
    const token = cookies(req).afg_session;
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
  }
  clearSessionCookies(res);
}

export function sendAuthJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: IncomingMessage, maxBytes = 16_384): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('Request body is too large.');
  }
  const parsed: unknown = JSON.parse(raw || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be a JSON object.');
  return parsed as Record<string, unknown>;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function isLoginRateLimited(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-for'];
  const address = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  const current = loginAttempts.get(address);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(address, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > LOGIN_MAX_ATTEMPTS;
}

export async function handleAuthApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/auth/')) return false;
  if (!pool) {
    sendAuthJson(res, 503, { error: 'Authentication requires DATABASE_URL and the database schema.' });
    return true;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    if (isLoginRateLimited(req)) {
      res.setHeader('Retry-After', '900');
      sendAuthJson(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256) {
        sendAuthJson(res, 400, { error: 'Enter a valid email and password.' });
        return true;
      }
      const result = await pool.query(
        `SELECT id, password_hash, status FROM users WHERE lower(email) = $1 LIMIT 1`,
        [email],
      );
      const row = result.rows[0];
      const valid = Boolean(row?.password_hash) && await verifyPassword(password, row.password_hash);
      if (!valid || row.status !== 'active') {
        sendAuthJson(res, 401, { error: 'Email or password is incorrect.' });
        return true;
      }
      await createSession(row.id, res);
      sendAuthJson(res, 200, { authenticated: true });
      return true;
    } catch {
      sendAuthJson(res, 400, { error: 'Unable to process the sign-in request.' });
      return true;
    }
  }

  if (pathname === '/api/auth/bootstrap-admin' && req.method === 'POST') {
    try {
      const configuredToken = process.env.AFG_ADMIN_BOOTSTRAP_TOKEN || '';
      const body = await readJsonBody(req);
      const suppliedToken = typeof body.bootstrapToken === 'string' ? body.bootstrapToken : '';
      if (configuredToken.length < 32 || suppliedToken.length !== configuredToken.length ||
          !timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(configuredToken))) {
        sendAuthJson(res, 403, { error: 'Admin bootstrap is not authorized or is not configured.' });
        return true;
      }
      const existingAdmins = await pool.query("SELECT 1 FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1");
      if (existingAdmins.rows.length) {
        sendAuthJson(res, 409, { error: 'An active administrator already exists. Bootstrap is permanently closed.' });
        return true;
      }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : 'AFG AI Administrator';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || password.length < 12 || password.length > 256) {
        sendAuthJson(res, 400, { error: 'Use a valid email and a password of at least 12 characters.' });
        return true;
      }
      const passwordHash = await hashPassword(password);
      const created = await pool.query(
        "INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active', updated_at = now() RETURNING id",
        [email, displayName, passwordHash],
      );
      await createSession(created.rows[0].id, res);
      sendAuthJson(res, 201, { authenticated: true, bootstrapped: true });
    } catch {
      sendAuthJson(res, 400, { error: 'Could not complete administrator bootstrap.' });
    }
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    try {
      const user = await authenticateRequest(req);
      sendAuthJson(res, user ? 200 : 401, user ? {
        authenticated: true,
        user: {
          id: user.id, email: user.email, displayName: user.displayName,
          role: user.role, defaultModel: user.defaultModel,
        },
      } : { authenticated: false });
    } catch {
      sendAuthJson(res, 401, { authenticated: false });
    }
    return true;
  }

  if (pathname === '/api/auth/preferences' && req.method === 'PATCH') {
    const user = await authenticateRequest(req);
    if (!user) { sendAuthJson(res, 401, { error: 'Sign in is required.' }); return true; }
    if (!verifyCsrf(req)) { sendAuthJson(res, 403, { error: 'CSRF validation failed.' }); return true; }
    try {
      const body = await readJsonBody(req);
      const defaultModel = typeof body.defaultModel === 'string' ? body.defaultModel.trim() : '';
      if (defaultModel) {
        const { getVerifiedModelDescriptors } = await import('../services/providerGateway.ts');
        const available = await getVerifiedModelDescriptors();
        const selected = available.find((model) => model.id === defaultModel && model.enabled && model.verifiedAt);
        if (!selected) { sendAuthJson(res, 400, { error: 'Default model must be enabled and health-verified.' }); return true; }
      }
      await pool.query('UPDATE users SET default_model = $1, updated_at = now() WHERE id = $2', [defaultModel || null, user.id]);
      sendAuthJson(res, 200, { defaultModel: defaultModel || null });
    } catch { sendAuthJson(res, 400, { error: 'Could not update account preferences.' }); }
    return true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    if (!verifyCsrf(req)) {
      sendAuthJson(res, 403, { error: 'CSRF validation failed.' });
      return true;
    }
    try {
      await destroySession(req, res);
      sendAuthJson(res, 200, { authenticated: false });
    } catch {
      sendAuthJson(res, 500, { error: 'Could not end the session.' });
    }
    return true;
  }

  sendAuthJson(res, 404, { error: 'Authentication route not found.' });
  return true;
}
