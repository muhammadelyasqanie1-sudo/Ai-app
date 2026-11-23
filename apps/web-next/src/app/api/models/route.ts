import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json } from "@/lib/afg/api";
import { requireUser, isStaff } from "@/lib/afg/auth";
import { ensureProvidersSeeded, probeProviderCached } from "@/lib/afg/providers";
import { ensureAfgCloudModels, ensurePlatformSeeded } from "@/lib/afg/bootstrap";

export const dynamic = "force-dynamic";

/**
 * GET /api/models — the selectable model catalog.
 * Only enabled models of enabled providers are listed, with real capability flags.
 * The built-in AFG Cloud provider is lazily probed (cached, at most once per
 * 60s) so its models appear only once a real probe has verified the backend.
 */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  await ensureProvidersSeeded();
  await ensureAfgCloudModels();
  await ensurePlatformSeeded();

  const afgCloud = await db.provider.findUnique({ where: { slug: "afg-cloud" } });
  if (afgCloud && afgCloud.enabled && afgCloud.healthStatus === "UNKNOWN") {
    await probeProviderCached(afgCloud).catch(() => null);
  }

  const models = await db.model.findMany({
    where: { enabled: true, provider: { enabled: true } },
    include: { provider: { select: { slug: true, name: true, kind: true, healthStatus: true, lastCheckedAt: true } } },
    orderBy: [{ provider: { slug: "asc" } }, { displayName: "asc" }],
  });

  return json({
    models: models.map((m) => {
      const caps: string[] = JSON.parse(m.capabilities || "[]");
      return {
        slug: m.slug,
        displayName: m.displayName,
        providerSlug: m.provider.slug,
        providerName: m.provider.name,
        providerKind: m.provider.kind,
        providerHealth: m.provider.healthStatus,
        capabilities: caps,
        contextWindow: m.contextWindow,
        lastVerifiedAt: m.provider.lastCheckedAt?.toISOString() || null,
      };
    }),
  });
});
