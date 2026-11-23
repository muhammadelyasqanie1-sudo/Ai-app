import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json } from "@/lib/afg/api";
import { getSessionUser, isStaff } from "@/lib/afg/auth";
import { pruneRateLimits, pruneSessions } from "@/lib/afg/rate-limit";
import { checkAllProvidersHealth } from "@/lib/afg/providers";
import { ensurePlatformSeeded } from "@/lib/afg/bootstrap";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — real system diagnostics. Actually touches the database
 * and (for staff) triggers provider health checks. No hardcoded status.
 */
export const GET = handler(async (req: NextRequest) => {
  const started = Date.now();
  const checks: Record<string, { status: string; detail: string; latencyMs?: number }> = {};

  // Database: real round-trip
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: "HEALTHY", detail: "Database query succeeded.", latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: "UNREACHABLE", detail: err instanceof Error ? err.message : "Database connection failed" };
  }

  const user = await getSessionUser();
  const staff = user ? isStaff(user) : false;

  if (staff) {
    // Provider health: real network checks
    try {
      await checkAllProvidersHealth();
      const providers = await db.provider.findMany({ select: { slug: true, healthStatus: true, enabled: true } });
      for (const p of providers) {
        checks[`provider:${p.slug}`] = {
          status: p.enabled ? p.healthStatus : "DISABLED",
          detail: `Provider ${p.slug}`,
        };
      }
    } catch (err) {
      checks.providers = { status: "DEGRADED", detail: err instanceof Error ? err.message : "Provider check failed" };
    }

    // Housekeeping (opportunistic)
    try {
      const [prunedLimits, prunedSessions] = await Promise.all([pruneRateLimits(), pruneSessions()]);
      checks.housekeeping = { status: "HEALTHY", detail: `Pruned ${prunedLimits} rate-limit windows and ${prunedSessions} expired sessions.` };
    } catch {
      checks.housekeeping = { status: "DEGRADED", detail: "Housekeeping partially failed." };
    }
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "HEALTHY" || c.status === "DISABLED");
  const anyUnreachable = Object.values(checks).some((c) => c.status === "UNREACHABLE");

  await ensurePlatformSeeded().catch(() => null);

  return json(
    {
      status: anyUnreachable ? "UNHEALTHY" : allHealthy ? "HEALTHY" : "DEGRADED",
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      checks,
      time: new Date().toISOString(),
    },
    { status: anyUnreachable && checks.database?.status === "UNREACHABLE" ? 503 : 200 }
  );
});
