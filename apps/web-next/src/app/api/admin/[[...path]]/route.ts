import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { requireStaff, toSafeUser, clientIp, AuthError } from "@/lib/afg/auth";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/afg/crypto";
import { logAudit, logError } from "@/lib/afg/logs";
import { config, STAFF_PERMISSIONS, StaffPermission } from "@/lib/afg/config";
import {
  ensureProvidersSeeded,
  checkProviderHealth,
  refreshProviderCatalog,
  getProviderAdapter,
} from "@/lib/afg/providers";
import { pruneRateLimits, pruneSessions } from "@/lib/afg/rate-limit";
import {
  providerCreateSchema,
  providerUpdateSchema,
  adminUserUpdateSchema,
  flagUpdateSchema,
  announcementSchema,
  formatZodError,
} from "@/lib/afg/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

const WRITE_PERMS: Record<string, StaffPermission> = {
  users: "users.write",
  providers: "providers.write",
  models: "models.write",
  flags: "flags.write",
  announcements: "announcements.write",
  settings: "settings.write",
};

const READ_PERMS: Record<string, StaffPermission> = {
  users: "users.read",
  providers: "providers.read",
  usage: "usage.read",
  errors: "errors.read",
  audit: "audit.read",
  stats: "usage.read",
  "system-health": "health.read",
};

function requirePerm(section: string, write: boolean) {
  if (write) return requireStaff(WRITE_PERMS[section] || "settings.write");
  return requireStaff(READ_PERMS[section]);
}

/** GET /api/admin/<section>[/<id>] */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  const { path = [] } = await ctx.params;
  const [section] = path;
  const url = req.nextUrl;

  switch (section) {
    case "stats": {
      await requireStaff("usage.read");
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 3600_000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
      const [totalUsers, activeUsers, guests, conversations, messages, chatToday, errorsToday, providers, models] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { status: "ACTIVE", isGuest: false } }),
        db.user.count({ where: { isGuest: true } }),
        db.conversation.count(),
        db.message.count(),
        db.usageLog.count({ where: { createdAt: { gte: dayAgo }, kind: "chat" } }),
        db.errorLog.count({ where: { createdAt: { gte: dayAgo } } }),
        db.provider.findMany({ orderBy: { slug: "asc" } }),
        db.model.count({ where: { enabled: true, provider: { enabled: true } } }),
      ]);
      const usageByDay = await db.usageLog.groupBy({
        by: ["kind"],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
        _sum: { tokensIn: true, tokensOut: true },
      });
      const topModels = await db.usageLog.groupBy({
        by: ["modelSlug"],
        where: { createdAt: { gte: weekAgo }, kind: "chat" },
        _count: { _all: true },
        orderBy: { _count: { modelSlug: "desc" } },
        take: 6,
      });
      return json({
        totals: { totalUsers, activeUsers, guests, conversations, messages, chatToday, errorsToday, activeModels: models },
        usageByDay: usageByDay.map((u) => ({ kind: u.kind, count: u._count._all, tokensIn: u._sum.tokensIn || 0, tokensOut: u._sum.tokensOut || 0 })),
        topModels: topModels.map((t) => ({ model: t.modelSlug, count: t._count._all })),
        providers: providers.map((p) => ({
          slug: p.slug, name: p.name, kind: p.kind, enabled: p.enabled, healthStatus: p.healthStatus,
          healthDetail: p.healthDetail, lastCheckedAt: p.lastCheckedAt?.toISOString() || null,
        })),
      });
    }

    case "users": {
      await requireStaff("users.read");
      const q = url.searchParams.get("q")?.trim().slice(0, 80) || "";
      const users = await db.user.findMany({
        where: q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return json({
        users: users.map((u) => ({
          ...toSafeUser(u),
          conversationCount: undefined,
          lastSeenAt: u.lastSeenAt?.toISOString() || null,
        })),
        permissionsCatalog: STAFF_PERMISSIONS,
      });
    }

    case "providers": {
      await requireStaff("providers.read");
      await ensureProvidersSeeded();
      const providers = await db.provider.findMany({ orderBy: { slug: "asc" }, include: { models: true } });
      return json({
        providers: providers.map((p) => ({
          id: p.id, slug: p.slug, name: p.name, kind: p.kind, baseUrl: p.baseUrl,
          enabled: p.enabled, healthStatus: p.healthStatus, healthDetail: p.healthDetail,
          lastCheckedAt: p.lastCheckedAt?.toISOString() || null,
          hasKey: !!p.apiKeyEnc, keyMask: p.apiKeyEnc ? maskSecret(decryptSecret(p.apiKeyEnc) || "") : null,
          config: JSON.parse(p.config || "{}"),
          models: p.models.map((m) => ({ id: m.id, slug: m.slug, displayName: m.displayName, capabilities: JSON.parse(m.capabilities || "[]"), enabled: m.enabled, contextWindow: m.contextWindow })),
        })),
      });
    }

    case "models": {
      await requireStaff("providers.read");
      const models = await db.model.findMany({ include: { provider: { select: { slug: true, name: true } } }, orderBy: { slug: "asc" }, take: 200 });
      return json({
        models: models.map((m) => ({
          id: m.id, slug: m.slug, displayName: m.displayName, modelId: m.modelId,
          providerSlug: m.provider.slug, providerName: m.provider.name,
          capabilities: JSON.parse(m.capabilities || "[]"), enabled: m.enabled,
          contextWindow: m.contextWindow, lastVerifiedAt: m.lastVerifiedAt?.toISOString() || null,
        })),
      });
    }

    case "usage": {
      await requireStaff("usage.read");
      const days = Math.min(Number(url.searchParams.get("days")) || 7, 30);
      const logs = await db.usageLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - days * 24 * 3600_000) } },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { user: { select: { email: true, name: true } } },
      });
      return json({
        usage: logs.map((l) => ({
          id: l.id, user: l.user?.email || l.user?.name || "unknown", provider: l.providerSlug,
          model: l.modelSlug, kind: l.kind, tokensIn: l.tokensIn, tokensOut: l.tokensOut,
          latencyMs: l.latencyMs, success: l.success, createdAt: l.createdAt.toISOString(),
        })),
      });
    }

    case "errors": {
      await requireStaff("errors.read");
      const logs = await db.errorLog.findMany({
        orderBy: { createdAt: "desc" }, take: 150,
      });
      return json({
        errors: logs.map((e) => ({
          id: e.id, userId: e.userId, scope: e.scope, code: e.code, message: e.message,
          meta: JSON.parse(e.meta || "{}"), createdAt: e.createdAt.toISOString(),
        })),
      });
    }

    case "audit": {
      await requireStaff("audit.read");
      const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 150 });
      return json({
        audit: logs.map((a) => ({
          id: a.id, actorEmail: a.actorEmail, actorId: a.actorId, action: a.action,
          target: a.target, meta: JSON.parse(a.meta || "{}"), ip: a.ip, createdAt: a.createdAt.toISOString(),
        })),
      });
    }

    case "flags": {
      await requireStaff();
      const flags = await db.featureFlag.findMany({ orderBy: { key: "asc" } });
      return json({ flags });
    }

    case "announcements": {
      await requireStaff();
      const items = await db.announcement.findMany({ orderBy: { createdAt: "desc" } });
      return json({ announcements: items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })) });
    }

    case "system-health": {
      await requireStaff("health.read");
      const dbStart = Date.now();
      let dbOk = true;
      try { await db.$queryRaw`SELECT 1`; } catch { dbOk = false; }
      const dbLatency = Date.now() - dbStart;
      const providers = await db.provider.findMany({ select: { slug: true, healthStatus: true, enabled: true, lastCheckedAt: true } });
      const expiredSessions = await db.session.count({ where: { expiresAt: { lt: new Date() } } });
      return json({
        database: { ok: dbOk, latencyMs: dbLatency },
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        nodeVersion: process.version,
        providers,
        expiredSessions,
        rateLimitWindows: await db.rateLimitHit.count(),
        emailConfigured: !!config.email.resendApiKey,
        googleConfigured: !!config.googleOAuth.clientId,
        devCodes: config.allowDevCodes,
        time: new Date().toISOString(),
      });
    }

    default:
      return fail("NOT_FOUND", "Unknown admin section.", 404);
  }
});

/** POST /api/admin/<section>[/<id>/<action>] */
export const POST = handler(async (req: NextRequest, ctx: Ctx) => {
  const { path = [] } = await ctx.params;
  const [section, id, action] = path;
  const actor = await requirePerm(section === undefined ? "" : section, true);
  const ip = clientIp(req);

  switch (section) {
    case "providers": {
      // POST /api/admin/providers — create a custom provider
      if (!id) {
        const body = providerCreateSchema.safeParse(await readJson(req));
        if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
        const existing = await db.provider.findUnique({ where: { slug: body.data.slug } });
        if (existing) return fail("SLUG_TAKEN", "A provider with this slug already exists.", 409);
        const provider = await db.provider.create({
          data: {
            slug: body.data.slug,
            name: body.data.name,
            kind: body.data.kind,
            baseUrl: body.data.baseUrl,
            apiKeyEnc: body.data.apiKey ? encryptSecret(body.data.apiKey) : null,
            enabled: true,
            config: JSON.stringify({ source: "admin" }),
          },
        });
        await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.provider_create", target: provider.slug, ip });
        return json({ ok: true, id: provider.id }, { status: 201 });
      }
      // POST /api/admin/providers/:id/(health|refresh)
      if (action === "health" || action === "refresh") {
        const provider = await db.provider.findUnique({ where: { id } });
        if (!provider) return fail("NOT_FOUND", "Provider not found.", 404);
        const health = await checkProviderHealth(provider);
        await logAudit({ actorId: actor.id, actorEmail: actor.email, action: `admin.provider_${action}`, target: provider.slug, meta: { status: health.status }, ip });
        if (action === "refresh") {
          const p2 = await db.provider.findUnique({ where: { id } });
          if (p2) {
            const catalog = await refreshProviderCatalog(p2);
            return json({ ok: true, health, discovered: catalog.discovered, catalogError: catalog.error || null });
          }
        }
        return json({ ok: true, health });
      }
      return fail("NOT_FOUND", "Unknown provider action.", 404);
    }

    case "announcements": {
      const body = announcementSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const item = await db.announcement.create({ data: body.data });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.announcement_create", target: item.id, ip });
      return json({ announcement: { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() } }, { status: 201 });
    }

    case "system-health": {
      if (action === "prune") {
        const [limits, sessions] = await Promise.all([pruneRateLimits(), pruneSessions()]);
        await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.prune", meta: { limits, sessions }, ip });
        return json({ ok: true, prunedRateLimits: limits, prunedSessions: sessions });
      }
      return fail("NOT_FOUND", "Unknown action.", 404);
    }

    default:
      return fail("NOT_FOUND", "Unknown admin section.", 404);
  }
});

/** PATCH /api/admin/<section>/<id> */
export const PATCH = handler(async (req: NextRequest, ctx: Ctx) => {
  const { path = [] } = await ctx.params;
  const [section, id] = path;
  if (!id) return fail("INVALID_INPUT", "Resource id required.", 400);
  const actor = await requirePerm(section, true);
  const ip = clientIp(req);

  switch (section) {
    case "users": {
      const body = adminUserUpdateSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const target = await db.user.findUnique({ where: { id } });
      if (!target) return fail("NOT_FOUND", "User not found.", 404);
      const data: Record<string, unknown> = {};
      if (body.data.role !== undefined) data.role = body.data.role;
      if (body.data.status !== undefined) data.status = body.data.status;
      if (body.data.name !== undefined) data.name = body.data.name;
      if (body.data.permissions !== undefined) {
        const valid = body.data.permissions.filter((p) => (STAFF_PERMISSIONS as readonly string[]).includes(p));
        data.permissions = JSON.stringify(valid);
        if (data.role === undefined && target.role !== "STAFF") data.role = "STAFF";
      }
      if (target.role === "ADMIN" && body.data.role && body.data.role !== "ADMIN") {
        const adminCount = await db.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) return fail("LAST_ADMIN", "Cannot demote the only administrator.", 409);
      }
      const updated = await db.user.update({ where: { id }, data });
      if (body.data.status === "SUSPENDED") {
        await db.session.deleteMany({ where: { userId: id } });
      }
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.user_update", target: target.email || id, meta: body.data, ip });
      return json({ user: toSafeUser(updated) });
    }

    case "providers": {
      const body = providerUpdateSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const provider = await db.provider.findUnique({ where: { id } });
      if (!provider) return fail("NOT_FOUND", "Provider not found.", 404);
      const data: Record<string, unknown> = {};
      if (body.data.name !== undefined) data.name = body.data.name;
      if (body.data.baseUrl !== undefined) data.baseUrl = body.data.baseUrl;
      if (body.data.enabled !== undefined) {
        data.enabled = body.data.enabled;
        if (provider.slug === "afg-cloud" && body.data.enabled === false) {
          return fail("PROTECTED_PROVIDER", "The built-in AFG Cloud provider cannot be disabled.", 409);
        }
        data.healthStatus = body.data.enabled ? "UNKNOWN" : "DISABLED";
      }
      if (body.data.apiKey !== undefined) {
        data.apiKeyEnc = body.data.apiKey ? encryptSecret(body.data.apiKey) : null;
      }
      const updated = await db.provider.update({ where: { id }, data });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.provider_update", target: provider.slug, meta: { fields: Object.keys(body.data) }, ip });
      return json({
        provider: {
          id: updated.id, slug: updated.slug, name: updated.name, kind: updated.kind,
          baseUrl: updated.baseUrl, enabled: updated.enabled, healthStatus: updated.healthStatus,
          hasKey: !!updated.apiKeyEnc,
        },
      });
    }

    case "models": {
      const body = await readJson<{ enabled?: boolean; displayName?: string; capabilities?: string[]; contextWindow?: number }>(req);
      const model = await db.model.findUnique({ where: { id } });
      if (!model) return fail("NOT_FOUND", "Model not found.", 404);
      const data: Record<string, unknown> = {};
      if (typeof body.enabled === "boolean") data.enabled = body.enabled;
      if (typeof body.displayName === "string" && body.displayName.trim()) data.displayName = body.displayName.slice(0, 120);
      if (Array.isArray(body.capabilities)) {
        const validCaps = body.capabilities.filter((c) => ["chat", "coding", "vision", "reasoning", "tools"].includes(c));
        data.capabilities = JSON.stringify(validCaps.length ? validCaps : ["chat"]);
      }
      if (typeof body.contextWindow === "number" && body.contextWindow > 512 && body.contextWindow <= 2_000_000) {
        data.contextWindow = Math.round(body.contextWindow);
      }
      const updated = await db.model.update({ where: { id }, data });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.model_update", target: model.slug, meta: { fields: Object.keys(data) }, ip });
      return json({ model: { id: updated.id, slug: updated.slug, displayName: updated.displayName, enabled: updated.enabled, capabilities: JSON.parse(updated.capabilities || "[]"), contextWindow: updated.contextWindow } });
    }

    case "flags": {
      const body = flagUpdateSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const flag = await db.featureFlag.update({ where: { key: id }, data: { enabled: body.data.enabled } });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.flag_update", target: id, meta: { enabled: body.data.enabled }, ip });
      return json({ flag });
    }

    case "announcements": {
      const body = announcementSchema.partial().safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const item = await db.announcement.update({ where: { id }, data: body.data });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.announcement_update", target: id, ip });
      return json({ announcement: { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() } });
    }

    default:
      return fail("NOT_FOUND", "Unknown admin section.", 404);
  }
});

/** DELETE /api/admin/<section>/<id> */
export const DELETE = handler(async (req: NextRequest, ctx: Ctx) => {
  const { path = [] } = await ctx.params;
  const [section, id] = path;
  if (!id) return fail("INVALID_INPUT", "Resource id required.", 400);
  const actor = await requirePerm(section, true);
  const ip = clientIp(req);

  switch (section) {
    case "users": {
      if (actor.role !== "ADMIN") return fail("FORBIDDEN", "Only administrators can delete users.", 403);
      if (actor.id === id) return fail("SELF_DELETE", "You cannot delete your own account.", 409);
      const target = await db.user.findUnique({ where: { id } });
      if (!target) return fail("NOT_FOUND", "User not found.", 404);
      if (target.role === "ADMIN") {
        const adminCount = await db.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) return fail("LAST_ADMIN", "Cannot delete the only administrator.", 409);
      }
      await db.user.delete({ where: { id } });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.user_delete", target: target.email || id, ip });
      return json({ ok: true });
    }
    case "providers": {
      const provider = await db.provider.findUnique({ where: { id } });
      if (!provider) return fail("NOT_FOUND", "Provider not found.", 404);
      if (provider.slug === "afg-cloud") return fail("PROTECTED_PROVIDER", "The built-in AFG Cloud provider cannot be deleted.", 409);
      await db.provider.delete({ where: { id } });
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.provider_delete", target: provider.slug, ip });
      return json({ ok: true });
    }
    case "announcements": {
      await db.announcement.delete({ where: { id } }).catch(() => null);
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "admin.announcement_delete", target: id, ip });
      return json({ ok: true });
    }
    default:
      return fail("NOT_FOUND", "Unknown admin section.", 404);
  }
});
