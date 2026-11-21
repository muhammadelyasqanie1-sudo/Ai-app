import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { requireUser } from "@/lib/afg/auth";
import { rateLimit } from "@/lib/afg/rate-limit";
import { config } from "@/lib/afg/config";
import { toolRunSchema, formatZodError } from "@/lib/afg/validate";
import { runTool, AVAILABLE_TOOLS } from "@/lib/afg/tools";

export const dynamic = "force-dynamic";

/** GET /api/tools — tool catalog with real availability flags. */
export const GET = handler(async () => {
  await requireUser();
  const flags = await db.featureFlag.findMany();
  const flagMap = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  return json({
    tools: AVAILABLE_TOOLS.map((t) => ({
      ...t,
      available: flagMap[t.id] !== false, // feature-flag gated, default on
    })),
  });
});

/** POST /api/tools — execute a tool. Real execution only. */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const rl = await rateLimit(`tool:${user.id}`, config.limits.toolPerHour);
  if (!rl.allowed) return fail("RATE_LIMITED", "Tool rate limit reached. Try again later.", 429);

  const body = toolRunSchema.safeParse(await readJson(req));
  if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);

  const flags = await db.featureFlag.findMany();
  const flag = flags.find((f) => f.key === body.data.tool);
  if (flag && !flag.enabled) return fail("TOOL_DISABLED", `Tool "${body.data.tool}" is disabled by the administrator.`, 403);

  const started = Date.now();
  const result = await runTool(body.data.tool, body.data.args);
  await db.usageLog.create({
    data: {
      userId: user.id,
      providerSlug: "afg-cloud",
      modelSlug: `tool:${result.tool}`,
      kind: "tool",
      latencyMs: Date.now() - started,
      success: result.ok,
    },
  });
  if (!result.ok) return json({ error: result.error }, { status: 502 });
  return json(result);
});
