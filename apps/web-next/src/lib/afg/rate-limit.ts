import { db } from "@/lib/db";

/**
 * Distributed sliding-window rate limiter backed by the database.
 * Real persistence — works across processes.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
};

export async function rateLimit(key: string, limit: number, windowMs = 3600_000): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = windowStart.getTime() + windowMs;

  const hit = await db.rateLimitHit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  const allowed = hit.count <= limit;
  return { allowed, remaining: Math.max(0, limit - hit.count), resetAt };
}

/** Prune expired windows (call opportunistically, e.g. from cron/health route). */
export async function pruneRateLimits(): Promise<number> {
  const res = await db.rateLimitHit.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - 2 * 3600_000) } },
  });
  return res.count;
}

/** Housekeeping: delete expired sessions. */
export async function pruneSessions(): Promise<number> {
  const res = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
