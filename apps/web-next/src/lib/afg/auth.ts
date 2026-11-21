import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { generateToken, sha256Hex, safeEqual } from "./crypto";
import { config, StaffPermission } from "./config";
import type { User } from "@prisma/client";

export const SESSION_COOKIE = "afg_session";

export type SafeUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  role: string;
  permissions: string[];
  status: string;
  isGuest: boolean;
  locale: string;
  theme: string;
  voiceEnabled: boolean;
  voiceRate: number;
  voicePitch: number;
  memoryEnabled: boolean;
  systemPrompt: string | null;
  createdAt: string;
};

export function toSafeUser(u: User): SafeUser {
  return {
    id: u.id,
    email: u.email,
    emailVerified: !!u.emailVerifiedAt,
    name: u.name,
    role: u.role,
    permissions: JSON.parse(u.permissions || "[]"),
    status: u.status,
    isGuest: u.isGuest,
    locale: u.locale,
    theme: u.theme,
    voiceEnabled: u.voiceEnabled,
    voiceRate: u.voiceRate,
    voicePitch: u.voicePitch,
    memoryEnabled: u.memoryEnabled,
    systemPrompt: u.systemPrompt,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Create a DB-backed session and set the httpOnly cookie. */
export async function createSession(userId: string, userAgent?: string | null, ip?: string | null) {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 3600 * 1000);
  await db.session.create({
    data: { tokenHash: sha256Hex(token), userId, userAgent: userAgent || null, ip: ip || null, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd && !!config.appOrigin.startsWith("https"),
    expires: expiresAt,
    path: "/",
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Resolve the current user from the session cookie. Returns null when unauthenticated. */
export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  // Touch last-seen occasionally (not on every request to avoid write amplification)
  if (Date.now() - session.user.updatedAt.getTime() > 5 * 60 * 1000) {
    await db.user.update({ where: { id: session.user.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
  }
  return session.user;
}

export class AuthError extends Error {
  constructor(public code: string, public status = 401) {
    super(code);
  }
}

/** Require an authenticated user or throw AuthError. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", 401);
  return user;
}

export function isAdmin(user: User): boolean {
  return user.role === "ADMIN";
}

export function isStaff(user: User): boolean {
  return user.role === "ADMIN" || user.role === "STAFF";
}

export function hasPermission(user: User, permission: StaffPermission): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role !== "STAFF") return false;
  const perms: string[] = JSON.parse(user.permissions || "[]");
  return perms.includes(permission);
}

/** Require staff-level access (ADMIN or STAFF with permission) or throw. */
export async function requireStaff(permission?: StaffPermission): Promise<User> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (user.role === "STAFF") {
    if (!permission || hasPermission(user, permission)) return user;
    throw new AuthError("FORBIDDEN", 403);
  }
  throw new AuthError("FORBIDDEN", 403);
}

export function clientIp(req: NextRequest | Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** Signed share tokens for public conversation sharing. */
export function signShareId(conversationId: string): string {
  const mac = cryptoHmac(conversationId);
  return `${conversationId}.${mac.slice(0, 16)}`;
}

export function verifyShareId(share: string): string | null {
  const [id, mac] = share.split(".");
  if (!id || !mac) return null;
  return safeEqual(cryptoHmac(id).slice(0, 16), mac) ? id : null;
}

function cryptoHmac(value: string): string {
  const hmac = crypto.createHmac("sha256", config.sessionSecret);
  hmac.update(value);
  return hmac.digest("hex");
}
