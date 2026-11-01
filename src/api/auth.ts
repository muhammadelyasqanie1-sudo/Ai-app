import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
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
function hashEmailCode(value: string): string {
  const pepper = process.env.AFG_EMAIL_CODE_PEPPER || process.env.RESEND_API_KEY || '';
  return createHash('sha256').update(pepper + ':' + value).digest('hex');
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
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (/^\$2[aby]\$/.test(encoded)) return bcrypt.compare(password, encoded);
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


async function sendEmailCode(email: string, code: string, purpose: 'verify_email' | 'password_reset'): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.EMAIL_FROM || '';
  if (!apiKey || !from) return false;
  const subject = purpose === 'verify_email' ? 'Verify your AFG AI account' : 'Reset your AFG AI password';
  const description = purpose === 'verify_email' ? 'Use this code to verify your email address.' : 'Use this code to reset your password.';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, text: description + '\n\n' + code + '\n\nThis code expires in 10 minutes. If you did not request it, ignore this email.' }),
  });
  return response.ok;
}
function clearOAuthState(res: ServerResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const existing = res.getHeader('Set-Cookie');
  const cookiesToKeep = Array.isArray(existing) ? existing.map(String) : (existing ? [String(existing)] : []);
  cookiesToKeep.push('afg_oauth_state=; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=0');
  res.setHeader('Set-Cookie', cookiesToKeep);
}
function configuredAppOrigin(): string {
  return (process.env.APP_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '');
}

export async function handleAuthApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/auth/')) return false;
  if (!pool) {
    sendAuthJson(res, 503, { error: 'Authentication requires DATABASE_URL and the database schema.' });
    return true;
  }


  if (pathname === '/api/auth/providers' && req.method === 'GET') {
    sendAuthJson(res, 200, { googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && configuredAppOrigin()) });
    return true;
  }

  if (pathname === '/api/auth/google/start' && req.method === 'GET') {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const origin = configuredAppOrigin();
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !origin) { sendAuthJson(res, 404, { error: 'Google sign-in is not configured.' }); return true; }
    const state = randomBytes(32).toString('base64url');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'afg_oauth_state=' + state + '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=600');
    const callback = origin + '/api/auth/google/callback';
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    res.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' }); res.end();
    return true;
  }

  if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
    const jar = cookies(req);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    const state = query.get('state') || '';
    const code = query.get('code') || '';
    if (!state || !jar.afg_oauth_state || state.length !== jar.afg_oauth_state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(jar.afg_oauth_state)) || !code) {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end(); return true;
    }
    try {
      const origin = configuredAppOrigin();
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: origin + '/api/auth/google/callback', grant_type: 'authorization_code' }),
      });
      const tokens = await tokenResponse.json() as { access_token?: string };
      if (!tokenResponse.ok || !tokens.access_token) throw new Error('Google token exchange failed');
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Google profile is not verified');
      const existingIdentity = await pool.query("SELECT user_id FROM auth_identities WHERE provider='google' AND provider_subject=$1", [profile.sub]);
      let userId = existingIdentity.rows[0]?.user_id as string | undefined;
      if (!userId) {
        const existingUser = await pool.query("SELECT id,status FROM users WHERE lower(email)=lower($1) LIMIT 1", [profile.email]);
        if (existingUser.rows[0]?.status === 'active') userId = existingUser.rows[0].id;
        if (!userId) {
          const created = await pool.query("INSERT INTO users(email,display_name,avatar_url,email_verified) VALUES($1,$2,$3,true) RETURNING id", [profile.email.toLowerCase(), (profile.name || 'AFG AI User').slice(0,100), profile.picture || null]);
          userId = created.rows[0].id;
        } else {
          await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1', [userId]);
        }
        await pool.query("INSERT INTO auth_identities(user_id,provider,provider_subject,email_verified) VALUES($1,'google',$2,true) ON CONFLICT(provider,provider_subject) DO NOTHING", [userId, profile.sub]);
      }
      await createSession(userId!, res);
      clearOAuthState(res); res.writeHead(302, { Location: origin + '/', 'Cache-Control': 'no-store' }); res.end();
    } catch {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end();
    }
    return true;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    if (isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) { sendAuthJson(res,503,{error:'Email verification is unavailable until RESEND_API_KEY and EMAIL_FROM are configured.'}); return true; }
      const body=await readJsonBody(req); const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const password=typeof body.password==='string'?body.password:''; const displayName=typeof body.displayName==='string'?body.displayName.trim().slice(0,100):'';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>256){sendAuthJson(res,400,{error:'Use a valid email and a password of at least 12 characters.'});return true;}
      const passwordHash=await hashPassword(password);
      const created=await pool.query("INSERT INTO users(email,display_name,password_hash,email_verified) VALUES($1,$2,$3,false) ON CONFLICT(email) DO NOTHING RETURNING id",[email,displayName||email,passwordHash]);
      if(!created.rows[0]){sendAuthJson(res,409,{error:'An account with this email may already exist. Try signing in or resetting your password.'});return true;}
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '10 minutes')",[created.rows[0].id,hashEmailCode(code)]);
      if(!await sendEmailCode(email,code,'verify_email')){await pool.query('DELETE FROM users WHERE id=$1',[created.rows[0].id]);sendAuthJson(res,502,{error:'Could not send the verification email. Check the email provider configuration.'});return true;}
      sendAuthJson(res,201,{verificationRequired:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not create the account.'});return true;}
  }

  if (pathname === '/api/auth/verify-email/resend' && req.method === 'POST') {
    if (isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const found=await pool.query("SELECT id FROM users WHERE lower(email)=$1 AND email_verified=false AND status='active' LIMIT 1",[email]);
      if(!found.rows[0]){sendAuthJson(res,200,{message:'If the account needs verification, a new code will be sent.'});return true;}
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '10 minutes')",[found.rows[0].id,hashEmailCode(code)]);
      if(!await sendEmailCode(email,code,'verify_email')){sendAuthJson(res,502,{error:'Could not send a new verification email.'});return true;}
      sendAuthJson(res,200,{message:'A new verification code was sent if the account is awaiting verification.'});return true;
    } catch { sendAuthJson(res,400,{error:'Could not resend the verification code.'});return true; }
  }

  if (pathname === '/api/auth/verify-email' && req.method === 'POST') {
    if (isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.code==='string'?body.code.trim():'';
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='verify_email' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];
      if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The verification code is invalid or expired.'});return true;}
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1',[row.id]);
      await createSession(row.id,res);sendAuthJson(res,200,{verified:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not verify this email.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/request' && req.method === 'POST') {
    if (isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const found=await pool.query("SELECT id FROM users WHERE lower(email)=$1 AND status='active' AND email_verified=true LIMIT 1",[email]);
      if(found.rows[0]&&process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){
        const code=String(randomInt(0,1000000)).padStart(6,'0');
        await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'password_reset',$2,now()+interval '10 minutes')",[found.rows[0].id,hashEmailCode(code)]);
        await sendEmailCode(email,code,'password_reset');
      }
      sendAuthJson(res,200,{message:'If the account exists and email delivery is configured, a reset code will be sent.'});return true;
    }catch{sendAuthJson(res,200,{message:'If the account exists and email delivery is configured, a reset code will be sent.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/confirm' && req.method === 'POST') {
    if (isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.code==='string'?body.code.trim():'';
      const next=typeof body.newPassword==='string'?body.newPassword:'';
      if(next.length<12||next.length>256){sendAuthJson(res,400,{error:'New password must be at least 12 characters.'});return true;}
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='password_reset' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The reset code is invalid or expired.'});return true;}
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(next),row.id]);
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('DELETE FROM sessions WHERE user_id=$1',[row.id]);sendAuthJson(res,200,{reset:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not reset the password.'});return true;}
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
        'SELECT id, password_hash, status, email_verified FROM users WHERE lower(email) = $1 LIMIT 1',
        [email],
      );
      const row = result.rows[0];
      const valid = Boolean(row?.password_hash) && await verifyPassword(password, row.password_hash);
      if (!valid || row.status !== 'active' || row.email_verified !== true) {
        sendAuthJson(res, 401, { error: 'Email or password is incorrect.' });
        return true;
      }
      if (typeof row.password_hash === 'string' && row.password_hash.startsWith('scrypt$')) {
        await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password), row.id]);
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) {
        sendAuthJson(res, 400, { error: 'Use a valid email and a password of at least 12 characters.' });
        return true;
      }
      const passwordHash = await hashPassword(password);
      const created = await pool.query(
        "INSERT INTO users (email, display_name, password_hash, role, email_verified) VALUES ($1, $2, $3, 'admin', true) ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active', email_verified = true, updated_at = now() RETURNING id",
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
        const selected = available.find((model) => (model.providerId + '::' + model.id === defaultModel || model.id === defaultModel) && model.enabled && model.verifiedAt);
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
);
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


async function sendEmailCode(email: string, code: string, purpose: 'verify_email' | 'password_reset'): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.EMAIL_FROM || '';
  if (!apiKey || !from) return false;
  const subject = purpose === 'verify_email' ? 'Verify your AFG AI account' : 'Reset your AFG AI password';
  const description = purpose === 'verify_email' ? 'Use this code to verify your email address.' : 'Use this code to reset your password.';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, text: description + '\\n\\n' + code + '\\n\\nThis code expires in 10 minutes. If you did not request it, ignore this email.' }),
  });
  return response.ok;
}
function clearOAuthState(res: ServerResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', 'afg_oauth_state=; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=0');
}
function configuredAppOrigin(): string {
  return (process.env.APP_ORIGIN || '').split(',')[0].trim().replace(/\\/$/, '');
}

export async function handleAuthApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/auth/')) return false;
  if (!pool) {
    sendAuthJson(res, 503, { error: 'Authentication requires DATABASE_URL and the database schema.' });
    return true;
  }


  if (pathname === '/api/auth/providers' && req.method === 'GET') {
    sendAuthJson(res, 200, { googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && configuredAppOrigin()) });
    return true;
  }

  if (pathname === '/api/auth/google/start' && req.method === 'GET') {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const origin = configuredAppOrigin();
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !origin) { sendAuthJson(res, 404, { error: 'Google sign-in is not configured.' }); return true; }
    const state = randomBytes(32).toString('base64url');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'afg_oauth_state=' + state + '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=600');
    const callback = origin + '/api/auth/google/callback';
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    res.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' }); res.end();
    return true;
  }

  if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
    const jar = cookies(req);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    const state = query.get('state') || '';
    const code = query.get('code') || '';
    if (!state || !jar.afg_oauth_state || state.length !== jar.afg_oauth_state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(jar.afg_oauth_state)) || !code) {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end(); return true;
    }
    try {
      const origin = configuredAppOrigin();
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: origin + '/api/auth/google/callback', grant_type: 'authorization_code' }),
      });
      const tokens = await tokenResponse.json() as { access_token?: string };
      if (!tokenResponse.ok || !tokens.access_token) throw new Error('Google token exchange failed');
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Google profile is not verified');
      const existingIdentity = await pool.query("SELECT user_id FROM auth_identities WHERE provider='google' AND provider_subject=$1", [profile.sub]);
      let userId = existingIdentity.rows[0]?.user_id as string | undefined;
      if (!userId) {
        const existingUser = await pool.query("SELECT id,status FROM users WHERE lower(email)=lower($1) LIMIT 1", [profile.email]);
        if (existingUser.rows[0]?.status === 'active') userId = existingUser.rows[0].id;
        if (!userId) {
          const created = await pool.query("INSERT INTO users(email,display_name,avatar_url,email_verified) VALUES($1,$2,$3,true) RETURNING id", [profile.email.toLowerCase(), (profile.name || 'AFG AI User').slice(0,100), profile.picture || null]);
          userId = created.rows[0].id;
        } else {
          await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1', [userId]);
        }
        await pool.query("INSERT INTO auth_identities(user_id,provider,provider_subject,email_verified) VALUES($1,'google',$2,true) ON CONFLICT(provider,provider_subject) DO NOTHING", [userId, profile.sub]);
      }
      await createSession(userId!, res);
      clearOAuthState(res); res.writeHead(302, { Location: origin + '/', 'Cache-Control': 'no-store' }); res.end();
    } catch {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end();
    }
    return true;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) { sendAuthJson(res,503,{error:'Email verification is unavailable until RESEND_API_KEY and EMAIL_FROM are configured.'}); return true; }
      const body=await readJsonBody(req); const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const password=typeof body.password==='string'?body.password:''; const displayName=typeof body.displayName==='string'?body.displayName.trim().slice(0,100):'';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>256){sendAuthJson(res,400,{error:'Use a valid email and a password of at least 12 characters.'});return true;}
      const passwordHash=await hashPassword(password);
      const created=await pool.query("INSERT INTO users(email,display_name,password_hash,email_verified) VALUES($1,$2,$3,false) ON CONFLICT(email) DO NOTHING RETURNING id",[email,displayName||email,passwordHash]);
      if(!created.rows[0]){sendAuthJson(res,409,{error:'An account with this email may already exist. Try signing in or resetting your password.'});return true;}
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '10 minutes')",[created.rows[0].id,hashEmailCode(code)]);
      if(!await sendEmailCode(email,code,'verify_email')){await pool.query('DELETE FROM users WHERE id=$1',[created.rows[0].id]);sendAuthJson(res,502,{error:'Could not send the verification email. Check the email provider configuration.'});return true;}
      sendAuthJson(res,201,{verificationRequired:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not create the account.'});return true;}
  }

  if (pathname === '/api/auth/verify-email' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.code==='string'?body.code.trim():'';
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='verify_email' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];
      if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The verification code is invalid or expired.'});return true;}
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1',[row.id]);
      await createSession(row.id,res);sendAuthJson(res,200,{verified:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not verify this email.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/request' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const found=await pool.query("SELECT id FROM users WHERE lower(email)=$1 AND status='active' AND email_verified=true LIMIT 1",[email]);
      if(found.rows[0]&&process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){
        const code=String(randomInt(0,1000000)).padStart(6,'0');
        await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'password_reset',$2,now()+interval '10 minutes')",[found.rows[0].id,hashEmailCode(code)]);
        await sendEmailCode(email,code,'password_reset');
      }
      sendAuthJson(res,200,{message:'If the account exists and email delivery is configured, a reset code will be sent.'});return true;
    }catch{sendAuthJson(res,200,{message:'If the account exists and email delivery is configured, a reset code will be sent.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/confirm' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.code==='string'?body.code.trim():'';
      const next=typeof body.newPassword==='string'?body.newPassword:'';
      if(next.length<12||next.length>256){sendAuthJson(res,400,{error:'New password must be at least 12 characters.'});return true;}
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='password_reset' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The reset code is invalid or expired.'});return true;}
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(next),row.id]);
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('DELETE FROM sessions WHERE user_id=$1',[row.id]);sendAuthJson(res,200,{reset:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not reset the password.'});return true;}
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
        `SELECT id, password_hash, status, email_verified FROM users WHERE lower(email) = $1 LIMIT 1`,
        [email],
      );
      const row = result.rows[0];
      const valid = Boolean(row?.password_hash) && await verifyPassword(password, row.password_hash);
      if (!valid || row.status !== 'active' || row.email_verified !== true) {
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) {
        sendAuthJson(res, 400, { error: 'Use a valid email and a password of at least 12 characters.' });
        return true;
      }
      const passwordHash = await hashPassword(password);
      const created = await pool.query(
        "INSERT INTO users (email, display_name, password_hash, role, email_verified) VALUES ($1, $2, $3, 'admin', true) ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active', updated_at = now() RETURNING id",
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
        const selected = available.find((model) => (model.providerId + '::' + model.id === defaultModel || model.id === defaultModel) && model.enabled && model.verifiedAt);
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
)) {
        await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password), row.id]);
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) {
        sendAuthJson(res, 400, { error: 'Use a valid email and a password of at least 12 characters.' });
        return true;
      }
      const passwordHash = await hashPassword(password);
      const created = await pool.query(
        "INSERT INTO users (email, display_name, password_hash, role, email_verified) VALUES ($1, $2, $3, 'admin', true) ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active', updated_at = now() RETURNING id",
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
        const selected = available.find((model) => (model.providerId + '::' + model.id === defaultModel || model.id === defaultModel) && model.enabled && model.verifiedAt);
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
);
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


async function sendEmailCode(email: string, code: string, purpose: 'verify_email' | 'password_reset'): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.EMAIL_FROM || '';
  if (!apiKey || !from) return false;
  const subject = purpose === 'verify_email' ? 'Verify your AFG AI account' : 'Reset your AFG AI password';
  const description = purpose === 'verify_email' ? 'Use this code to verify your email address.' : 'Use this code to reset your password.';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, text: description + '\\n\\n' + code + '\\n\\nThis code expires in 10 minutes. If you did not request it, ignore this email.' }),
  });
  return response.ok;
}
function clearOAuthState(res: ServerResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', 'afg_oauth_state=; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=0');
}
function configuredAppOrigin(): string {
  return (process.env.APP_ORIGIN || '').split(',')[0].trim().replace(/\\/$/, '');
}

export async function handleAuthApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/auth/')) return false;
  if (!pool) {
    sendAuthJson(res, 503, { error: 'Authentication requires DATABASE_URL and the database schema.' });
    return true;
  }


  if (pathname === '/api/auth/providers' && req.method === 'GET') {
    sendAuthJson(res, 200, { googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && configuredAppOrigin()) });
    return true;
  }

  if (pathname === '/api/auth/google/start' && req.method === 'GET') {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const origin = configuredAppOrigin();
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !origin) { sendAuthJson(res, 404, { error: 'Google sign-in is not configured.' }); return true; }
    const state = randomBytes(32).toString('base64url');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'afg_oauth_state=' + state + '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=600');
    const callback = origin + '/api/auth/google/callback';
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    res.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' }); res.end();
    return true;
  }

  if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
    const jar = cookies(req);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    const state = query.get('state') || '';
    const code = query.get('code') || '';
    if (!state || !jar.afg_oauth_state || state.length !== jar.afg_oauth_state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(jar.afg_oauth_state)) || !code) {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end(); return true;
    }
    try {
      const origin = configuredAppOrigin();
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: origin + '/api/auth/google/callback', grant_type: 'authorization_code' }),
      });
      const tokens = await tokenResponse.json() as { access_token?: string };
      if (!tokenResponse.ok || !tokens.access_token) throw new Error('Google token exchange failed');
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Google profile is not verified');
      const existingIdentity = await pool.query("SELECT user_id FROM auth_identities WHERE provider='google' AND provider_subject=$1", [profile.sub]);
      let userId = existingIdentity.rows[0]?.user_id as string | undefined;
      if (!userId) {
        const existingUser = await pool.query("SELECT id,status FROM users WHERE lower(email)=lower($1) LIMIT 1", [profile.email]);
        if (existingUser.rows[0]?.status === 'active') userId = existingUser.rows[0].id;
        if (!userId) {
          const created = await pool.query("INSERT INTO users(email,display_name,avatar_url,email_verified) VALUES($1,$2,$3,true) RETURNING id", [profile.email.toLowerCase(), (profile.name || 'AFG AI User').slice(0,100), profile.picture || null]);
          userId = created.rows[0].id;
        } else {
          await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1', [userId]);
        }
        await pool.query("INSERT INTO auth_identities(user_id,provider,provider_subject,email_verified) VALUES($1,'google',$2,true) ON CONFLICT(provider,provider_subject) DO NOTHING", [userId, profile.sub]);
      }
      await createSession(userId!, res);
      clearOAuthState(res); res.writeHead(302, { Location: origin + '/', 'Cache-Control': 'no-store' }); res.end();
    } catch {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end();
    }
    return true;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) { sendAuthJson(res,503,{error:'Email verification is unavailable until RESEND_API_KEY and EMAIL_FROM are configured.'}); return true; }
      const body=await readJsonBody(req); const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const password=typeof body.password==='string'?body.password:''; const displayName=typeof body.displayName==='string'?body.displayName.trim().slice(0,100):'';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>256){sendAuthJson(res,400,{error:'Use a valid email and a password of at least 12 characters.'});return true;}
      const passwordHash=await hashPassword(password);
      const created=await pool.query("INSERT INTO users(email,display_name,password_hash,email_verified) VALUES($1,$2,$3,false) ON CONFLICT(email) DO NOTHING RETURNING id",[email,displayName||email,passwordHash]);
      if(!created.rows[0]){sendAuthJson(res,409,{error:'An account with this email may already exist. Try signing in or resetting your password.'});return true;}
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '10 minutes')",[created.rows[0].id,hashEmailCode(code)]);
      if(!await sendEmailCode(email,code,'verify_email')){await pool.query('DELETE FROM users WHERE id=$1',[created.rows[0].id]);sendAuthJson(res,502,{error:'Could not send the verification email. Check the email provider configuration.'});return true;}
      sendAuthJson(res,201,{verificationRequired:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not create the account.'});return true;}
  }

  if (pathname === '/api/auth/verify-email' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.code==='string'?body.code.trim():'';
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='verify_email' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];
      if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The verification code is invalid or expired.'});return true;}
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1',[row.id]);
      await createSession(row.id,res);sendAuthJson(res,200,{verified:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not verify this email.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/request' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const found=await pool.query("SELECT id FROM users WHERE lower(email)=$1 AND status='active' AND email_verified=true LIMIT 1",[email]);
      if(found.rows[0]&&process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){
        const code=String(randomInt(0,1000000)).padStart(6,'0');
        await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'password_reset',$2,now()+interval '10 minutes')",[found.rows[0].id,hashEmailCode(code)]);
        await sendEmailCode(email,code,'password_reset');
      }
      sendAuthJson(res,200,{message:'If the account exists and email delivery is configured, a reset code will be sent.'});return true;
    }catch{sendAuthJson(res,200,{message:'If the account exists and email delivery is configured, a reset code will be sent.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/confirm' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.code==='string'?body.code.trim():'';
      const next=typeof body.newPassword==='string'?body.newPassword:'';
      if(next.length<12||next.length>256){sendAuthJson(res,400,{error:'New password must be at least 12 characters.'});return true;}
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='password_reset' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The reset code is invalid or expired.'});return true;}
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(next),row.id]);
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('DELETE FROM sessions WHERE user_id=$1',[row.id]);sendAuthJson(res,200,{reset:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not reset the password.'});return true;}
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
        `SELECT id, password_hash, status, email_verified FROM users WHERE lower(email) = $1 LIMIT 1`,
        [email],
      );
      const row = result.rows[0];
      const valid = Boolean(row?.password_hash) && await verifyPassword(password, row.password_hash);
      if (!valid || row.status !== 'active' || row.email_verified !== true) {
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) {
        sendAuthJson(res, 400, { error: 'Use a valid email and a password of at least 12 characters.' });
        return true;
      }
      const passwordHash = await hashPassword(password);
      const created = await pool.query(
        "INSERT INTO users (email, display_name, password_hash, role, email_verified) VALUES ($1, $2, $3, 'admin', true) ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active', updated_at = now() RETURNING id",
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
        const selected = available.find((model) => (model.providerId + '::' + model.id === defaultModel || model.id === defaultModel) && model.enabled && model.verifiedAt);
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
