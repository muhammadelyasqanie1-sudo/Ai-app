import { db } from "@/lib/db";

/** Structured error logging — never exposes internals to clients. */
export async function logError(input: {
  userId?: string | null;
  scope: string;
  code: string;
  message: string;
  meta?: unknown;
}) {
  try {
    await db.errorLog.create({
      data: {
        userId: input.userId || null,
        scope: input.scope,
        code: input.code,
        message: input.message.slice(0, 2000),
        meta: JSON.stringify(sanitizeMeta(input.meta)),
      },
    });
  } catch {
    // Logging must never break the request path
  }
}

/** Audit trail for security-relevant and admin actions. */
export async function logAudit(input: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  target?: string | null;
  meta?: unknown;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId || null,
        actorEmail: input.actorEmail || null,
        action: input.action,
        target: input.target || null,
        meta: JSON.stringify(sanitizeMeta(input.meta)),
        ip: input.ip || null,
      },
    });
  } catch {
    // Logging must never break the request path
  }
}

/** Redact obvious secret-looking fields from metadata. */
function sanitizeMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (/key|secret|token|password|authorization/i.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 500) {
      out[k] = v.slice(0, 500) + "…";
    } else {
      out[k] = v;
    }
  }
  return out;
}
