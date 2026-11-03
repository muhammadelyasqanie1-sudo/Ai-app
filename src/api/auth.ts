import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin' | 'superadmin';
  status: 'active' | 'suspended' | 'deleted';
  defaultModel: string | null;
}

function cookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const key = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    try { value = decodeURIComponent(value); } catch { return ['', '']; }
    return [key, value];
  }).filter(([key]) => key));
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
const AUTH_INPUT = {
  register: z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(256), displayName: z.string().trim().max(100).optional() }).strict(),
  login: z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(256) }).strict(),
  email: z.object({ email: z.string().trim().email().max(254) }).strict(),
  verify: z.object({ email: z.string().trim().email().max(254), code: z.string().regex(/^\d{6}$/) }).strict(),
  reset: z.object({ email: z.string().trim().email().max(254), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(12).max(256) }).strict(),
  bootstrap: z.object({ bootstrapToken: z.string().min(32).max(512), email: z.string().trim().email().max(254), displayName: z.string().trim().max(100).optional(), password: z.string().min(12).max(256) }).strict(),
};
function parseAuthInput<T extends z.ZodTypeAny>(schema: T, body: Record<string, unknown>): z.infer<T> | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

function hashEmailCode(value: string): string {
  const pepper = process.env.AFG_EMAIL_CODE_PEPPER || process.env.RESEND_API_KEY || '';
  return createHash('sha256').update(pepper + ':' + value).digest('hex');
}

export async function recordAuthSecurityEvent(req: IncomingMessage, userId: string | null, eventType: string, severity = 'info'): Promise<void> {
  if (!pool) return;
  const address = (req as IncomingMessage & { ip?: string }).ip || req.socket.remoteAddress || 'unknown';
  const ipHash = createHash('sha256').update(address).digest('hex');
  try {
    await pool.query(
      'INSERT INTO security_events(event_type,severity,user_id,ip_hash,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
      [eventType,severity,userId,ipHash,JSON.stringify({source:'auth-api'})],
    );
  } catch {
    // Security telemetry must never expose secrets or interrupt the authentication flow.
  }
}

export async function recordSecurityNotification(userId: string, eventType: string, title: string, body: string) {
  if (!pool) return;
  try {
    const result = await pool.query(
      "SELECT u.email, u.preferred_language, COALESCE((p.notifications_json->>'inApp')::boolean,true) AS in_app, COALESCE((p.notifications_json->>'email')::boolean,false) AS email_enabled, COALESCE((p.notifications_json->>'securityAlerts')::boolean,true) AS security_enabled FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id WHERE u.id=$1",
      [userId],
    );
    const preference = result.rows[0];
    if (!preference || preference.security_enabled !== true) return;
    const dari = preference.preferred_language === 'dari';
    const localized: Record<string,{title:string;body:string}> = {
      'security.sign_in': { title: dari ? 'ورود جدید' : title, body: dari ? 'حساب AFG AI شما با موفقیت وارد شد.' : body },
      'security.email_verified': { title: dari ? 'ایمیل تأیید شد' : title, body: dari ? 'نشانی ایمیل حساب AFG AI شما تأیید شد.' : body },
      'security.password_reset': { title: dari ? 'رمز عبور بازنشانی شد' : title, body: dari ? 'رمز عبور حساب شما تغییر کرد و نشست‌های قبلی لغو شدند.' : body },
      'security.password_changed': { title: dari ? 'رمز عبور تغییر کرد' : title, body: dari ? 'رمز عبور حساب AFG AI شما تغییر داده شد.' : body },
    };
    const message = localized[eventType] || { title, body };
    if (preference.in_app === true) {
      await pool.query('INSERT INTO user_notification_events(user_id,event_type,title,body) VALUES($1,$2,$3,$4)',[userId,eventType,message.title,message.body]);
    }
    const apiKey = process.env.RESEND_API_KEY || '';
    const from = process.env.EMAIL_FROM || '';
    if (preference.email_enabled === true && preference.email && apiKey && from) {
      try {
        void fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [preference.email], subject: 'AFG AI security alert: ' + message.title, text: message.body + '\n\nIf this activity was not yours, sign in and secure your account.' }),
        }).then((response) => { if (!response.ok) console.error('AFG_SECURITY_EMAIL_REJECTED'); }).catch(() => console.error('AFG_SECURITY_EMAIL_UNAVAILABLE'));
      } catch { console.error('AFG_SECURITY_EMAIL_UNAVAILABLE'); }
    }
  } catch { console.error('AFG_SECURITY_NOTIFICATION_UNAVAILABLE'); }
}

function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function ensureCsrfCookie(req: IncomingMessage, res: ServerResponse): void {
  const current = cookies(req).afg_csrf;
  if (current && current.length >= 32) return;
  const token = randomBytes(32).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const existing = res.getHeader('Set-Cookie');
  const values = Array.isArray(existing) ? existing.map(String) : (existing ? [String(existing)] : []);
  values.push(`afg_csrf=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  res.setHeader('Set-Cookie', values);
}

export function setSessionCookies(res: ServerResponse, sessionToken: string, csrfToken: string, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `afg_session=${encodeURIComponent(sessionToken)}; ${cookieOptions()}; Max-Age=${maxAgeSeconds}`,
    `afg_csrf=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`,
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
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    if (encoded.startsWith('$argon2id$')) return await argon2.verify(encoded, password);
    if (encoded.startsWith('$2')) return await bcrypt.compare(password, encoded);
    const [algorithm, saltHex, hashHex] = encoded.split(':');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function revokeUserSessions(userId: string): Promise<void> {
  if (!pool) return;
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
}

export async function authenticateRequest(req: IncomingMessage): Promise<AuthenticatedUser | null> {
  if (!pool) return null;
  const sessionToken = cookies(req).afg_session;
  if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256) return null;
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status, u.default_model
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND s.revoked_at IS NULL AND u.status = 'active'
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
    role: row.role === 'superadmin' ? 'superadmin' : row.role === 'admin' ? 'admin' : 'user',
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

export async function verifyUserPassword(userId:string,password:string):Promise<boolean>{
  if(!pool||!password||password.length>256)return false;
  const result=await pool.query('SELECT password_hash FROM users WHERE id=$1 AND status=\\'active\\' LIMIT 1',[userId]);
  const encoded=result.rows[0]?.password_hash;
  if(typeof encoded!=='string'||!encoded)return false;
  return verifyPassword(password,encoded);
}

export async function createSession(userId: string, res: ServerResponse): Promise<void> {
  if (!pool) throw new Error('Database is not configured.');
  const sessionToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const roleResult = await pool.query('SELECT role FROM users WHERE id=$1 LIMIT 1',[userId]);
  const isAdministrator = ['admin','superadmin'].includes(String(roleResult.rows[0]?.role || ''));
  const expiresAt = new Date(Date.now() + (isAdministrator ? 8 * 60 * 60 * 1000 : SESSION_TTL_MS));
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash(sessionToken), expiresAt],
  );
  setSessionCookies(res, sessionToken, csrfToken, isAdministrator ? 8 * 60 * 60 : Math.floor(SESSION_TTL_MS / 1000));
}

export async function destroySession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (pool) {
    const token = cookies(req).afg_session;
    if (token) await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash = $1 AND revoked_at IS NULL', [hash(token)]);
  }
  clearSessionCookies(res);
}

export function sendAuthJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const requestId = res.getHeader('X-Request-Id');
  res.end(JSON.stringify({ ...body, ...(typeof requestId === 'string' ? { requestId } : {}) }));
}

export async function readJsonBody(req: IncomingMessage, maxBytes = 16_384): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('Request body is too large.');
  }
  const parsed: unknown = JSON.parse(raw || '{}');
  const validated = z.record(z.string(), z.unknown()).safeParse(parsed);
  if (!validated.success) throw new Error('Request body must be a JSON object.');
  const inspect = (value: unknown, depth = 0): boolean => {
    if (depth > 20) return false;
    if (Array.isArray(value)) return value.length <= 1000 && value.every((item) => inspect(item, depth + 1));
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      return entries.length <= 500 && entries.every(([key, item]) =>
        !['__proto__','prototype','constructor'].includes(key) && inspect(item, depth + 1));
    }
    return true;
  };
  if (!inspect(validated.data)) throw new Error('Request body contains unsupported structure.');
  return validated.data;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

async function isLoginRateLimited(req: IncomingMessage): Promise<boolean> {
  const address = (req as IncomingMessage & { ip?: string }).ip || req.socket.remoteAddress || 'unknown';
  const key = createHash('sha256').update(address).digest('hex');
  if (pool) {
    try {
      const result = await pool.query(
        `INSERT INTO rate_limit_counters(scope_type,scope_key,window_start,request_count)
         VALUES('auth_ip',$1,to_timestamp((floor(extract(epoch FROM now())/900)*900)::double precision),1)
         ON CONFLICT(scope_type,scope_key,window_start)
         DO UPDATE SET request_count=rate_limit_counters.request_count+1
         RETURNING request_count`,
        [key],
      );
      return Number(result.rows[0]?.request_count || 0) > LOGIN_MAX_ATTEMPTS;
    } catch {
      // Retain a conservative local fallback if the database limiter cannot be reached.
    }
  }
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
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
export async function requestAdminPasswordReset(userId:string):Promise<{sent:boolean}>{
  if(!pool||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {sent:false};
  const found=await pool.query("SELECT id,email FROM users WHERE id=$1 AND status='active' AND email_verified=true LIMIT 1",[userId]);
  const row=found.rows[0];
  if(!row?.email)return {sent:false};
  const code=String(randomInt(0,1000000)).padStart(6,'0');
  await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'password_reset',$2,now()+interval '10 minutes')",[row.id,hashEmailCode(code)]);
  const sent=await sendEmailCode(String(row.email),code,'password_reset').catch(()=>false);
  if(sent)await recordAuthSecurityEvent({headers:{},socket:{remoteAddress:'admin-api'}} as unknown as IncomingMessage,row.id,'auth.admin_password_reset_requested','warning');
  return {sent};
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
    ensureCsrfCookie(req,res);
    sendAuthJson(res, 200, { googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && configuredAppOrigin()), emailEnabled: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
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
      await recordAuthSecurityEvent(req,userId!,'auth.google_login');
      await recordSecurityNotification(userId!, 'security.sign_in', 'New sign-in', 'Your AFG AI account was signed in with Google.');
      clearOAuthState(res); res.writeHead(302, { Location: origin + '/', 'Cache-Control': 'no-store' }); res.end();
    } catch {
      clearOAuthState(res); res.writeHead(302, { Location: configuredAppOrigin() + '/?auth=google_failed' }); res.end();
    }
    return true;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    if (await isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) { sendAuthJson(res,503,{error:'Email verification is unavailable until RESEND_API_KEY and EMAIL_FROM are configured.'}); return true; }
      const parsed=parseAuthInput(AUTH_INPUT.register,await readJsonBody(req)); if(!parsed){sendAuthJson(res,400,{error:'Use a valid email and a password of at least 12 characters.'});return true;}
      const body=parsed; const email=body.email.toLowerCase(); const password=body.password; const displayName=body.displayName || '';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>256){sendAuthJson(res,400,{error:'Use a valid email and a password of at least 12 characters.'});return true;}
      const passwordHash=await hashPassword(password);
      const created=await pool.query("INSERT INTO users(email,display_name,password_hash,email_verified) VALUES($1,$2,$3,false) ON CONFLICT(email) DO NOTHING RETURNING id",[email,displayName||email,passwordHash]);
      if(!created.rows[0]){sendAuthJson(res,409,{error:'An account with this email may already exist. Try signing in or resetting your password.'});return true;}
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '10 minutes')",[created.rows[0].id,hashEmailCode(code)]);
      if(!await sendEmailCode(email,code,'verify_email')){await pool.query('DELETE FROM users WHERE id=$1',[created.rows[0].id]);sendAuthJson(res,502,{error:'Could not send the verification email. Check the email provider configuration.'});return true;}
      await recordAuthSecurityEvent(req,created.rows[0].id,'auth.register');sendAuthJson(res,201,{verificationRequired:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not create the account.'});return true;}
  }

  if (pathname === '/api/auth/verify-email/resend' && req.method === 'POST') {
    if (await isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const parsed=parseAuthInput(AUTH_INPUT.email,await readJsonBody(req));if(!parsed){sendAuthJson(res,400,{error:'Enter a valid email address.'});return true;} const email=parsed.email.toLowerCase();
      const found=await pool.query("SELECT id FROM users WHERE lower(email)=$1 AND email_verified=false AND status='active' LIMIT 1",[email]);
      if(!found.rows[0]){sendAuthJson(res,200,{message:'If the account needs verification, a new code will be sent.'});return true;}
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      await pool.query("INSERT INTO email_verification_codes(user_id,purpose,code_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '10 minutes')",[found.rows[0].id,hashEmailCode(code)]);
      if(!await sendEmailCode(email,code,'verify_email')){sendAuthJson(res,502,{error:'Could not send a new verification email.'});return true;}
      sendAuthJson(res,200,{message:'A new verification code was sent if the account is awaiting verification.'});return true;
    } catch { sendAuthJson(res,400,{error:'Could not resend the verification code.'});return true; }
  }

  if (pathname === '/api/auth/verify-email' && req.method === 'POST') {
    if (await isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const parsed=parseAuthInput(AUTH_INPUT.verify,await readJsonBody(req));if(!parsed){sendAuthJson(res,400,{error:'Enter a valid email and six-digit code.'});return true;} const email=parsed.email.toLowerCase();const code=parsed.code;
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='verify_email' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];
      if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The verification code is invalid or expired.'});return true;}
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await pool.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1',[row.id]);
      await createSession(row.id,res);await recordAuthSecurityEvent(req,row.id,'auth.email_verified');await recordSecurityNotification(row.id,'security.email_verified','Email verified','Your AFG AI email address was verified.');sendAuthJson(res,200,{verified:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not verify this email.'});return true;}
  }

  if (pathname === '/api/auth/password-reset/request' && req.method === 'POST') {
    if (await isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const parsed=parseAuthInput(AUTH_INPUT.email,await readJsonBody(req));if(!parsed){sendAuthJson(res,400,{error:'Enter a valid email address.'});return true;} const email=parsed.email.toLowerCase();
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
    if (await isLoginRateLimited(req)) { res.setHeader('Retry-After','900'); sendAuthJson(res,429,{error:'Too many account requests. Try again later.'}); return true; }
    try {
      const parsed=parseAuthInput(AUTH_INPUT.reset,await readJsonBody(req));if(!parsed){sendAuthJson(res,400,{error:'Enter a valid email, six-digit code and password of at least 12 characters.'});return true;} const email=parsed.email.toLowerCase();const code=parsed.code;const next=parsed.newPassword;
      if(next.length<12||next.length>256){sendAuthJson(res,400,{error:'New password must be at least 12 characters.'});return true;}
      const found=await pool.query("SELECT u.id,c.id AS code_id,c.code_hash,c.attempts FROM users u JOIN email_verification_codes c ON c.user_id=u.id WHERE lower(u.email)=$1 AND c.purpose='password_reset' AND c.consumed_at IS NULL AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 1",[email]);
      const row=found.rows[0];if(!row||row.attempts>=5||!/^\d{6}$/.test(code)||hashEmailCode(code)!==row.code_hash){if(row)await pool.query('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.code_id]);sendAuthJson(res,400,{error:'The reset code is invalid or expired.'});return true;}
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(next),row.id]);
      await pool.query('UPDATE email_verification_codes SET consumed_at=now() WHERE id=$1',[row.code_id]);
      await revokeUserSessions(row.id);clearSessionCookies(res);await recordAuthSecurityEvent(req,row.id,'auth.password_reset','warning');await recordSecurityNotification(row.id,'security.password_reset','Password reset','Your AFG AI account password was reset. All previous sessions were revoked.');sendAuthJson(res,200,{reset:true});return true;
    }catch{sendAuthJson(res,400,{error:'Could not reset the password.'});return true;}
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    if (await isLoginRateLimited(req)) {
      res.setHeader('Retry-After', '900');
      sendAuthJson(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
      return true;
    }
    try {
      const parsed = parseAuthInput(AUTH_INPUT.login, await readJsonBody(req));
      if (!parsed) { sendAuthJson(res, 400, { error: 'Enter a valid email and password.' }); return true; }
      const email = parsed.email.toLowerCase();
      const password = parsed.password;
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
        await recordAuthSecurityEvent(req,row?.id || null,'auth.login_failed','warning');
        sendAuthJson(res, 401, { error: 'Email or password is incorrect.' });
        return true;
      }
      if (typeof row.password_hash === 'string' && !row.password_hash.startsWith('$argon2id$')) {
        await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password), row.id]);
      }
      await createSession(row.id, res);
      await recordAuthSecurityEvent(req,row.id,'auth.login');
      await recordSecurityNotification(row.id, 'security.sign_in', 'New sign-in', 'Your AFG AI account was signed in successfully.');
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
      const rawBody = await readJsonBody(req);
      const parsed = parseAuthInput(AUTH_INPUT.bootstrap, rawBody);
      if (!parsed) { sendAuthJson(res, 400, { error: 'Provide a valid bootstrap token, email and password of at least 12 characters.' }); return true; }
      const body = parsed;
      const suppliedToken = body.bootstrapToken;
      if (configuredToken.length < 32 || suppliedToken.length !== configuredToken.length ||
          !timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(configuredToken))) {
        sendAuthJson(res, 403, { error: 'Admin bootstrap is not authorized or is not configured.' });
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
      const client = await pool.connect();
      let adminUserId = '';
      try {
        await client.query('BEGIN');
        // Serialize first-admin creation so concurrent requests cannot create multiple administrators.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('afg-ai:admin-bootstrap'))");
        const existingAdmins = await client.query("SELECT 1 FROM users WHERE role IN ('admin','superadmin') AND status = 'active' LIMIT 1");
        if (existingAdmins.rows.length) {
          await client.query('ROLLBACK');
          sendAuthJson(res, 409, { error: 'An active administrator already exists. Bootstrap is permanently closed.' });
          return true;
        }
        const existingUser = await client.query(
          'SELECT id,status FROM users WHERE lower(email)=lower($1) LIMIT 1 FOR UPDATE',
          [email],
        );
        if (existingUser.rows[0] && existingUser.rows[0].status !== 'active') {
          await client.query('ROLLBACK');
          sendAuthJson(res, 409, { error: 'The selected account is not active. Use a different email or restore the account through an authorized process.' });
          return true;
        }
        if (existingUser.rows[0]) {
          const promoted = await client.query(
            "UPDATE users SET display_name=$2,password_hash=$3,role='superadmin',email_verified=true,updated_at=now() WHERE id=$1 RETURNING id",
            [existingUser.rows[0].id,displayName,passwordHash],
          );
          adminUserId = promoted.rows[0].id;
        } else {
          const created = await client.query(
            "INSERT INTO users (email,display_name,password_hash,role,email_verified) VALUES ($1,$2,$3,'superadmin',true) RETURNING id",
            [email,displayName,passwordHash],
          );
          adminUserId = created.rows[0].id;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await createSession(adminUserId, res);
      await recordAuthSecurityEvent(req,adminUserId,'auth.admin_bootstrap','warning');
      sendAuthJson(res, 201, { authenticated: true, bootstrapped: true });
    } catch {
      sendAuthJson(res, 400, { error: 'Could not complete administrator bootstrap.' });
    }
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    ensureCsrfCookie(req,res);
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
      await pool.query('INSERT INTO user_preferences (user_id, default_model) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET default_model = EXCLUDED.default_model, updated_at = now()', [user.id, defaultModel || null]);
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
