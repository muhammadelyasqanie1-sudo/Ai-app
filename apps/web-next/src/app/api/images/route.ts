import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { requireUser } from "@/lib/afg/auth";
import { rateLimit } from "@/lib/afg/rate-limit";
import { config } from "@/lib/afg/config";
import { logError } from "@/lib/afg/logs";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** POST /api/images — real text-to-image generation. */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const rl = await rateLimit(`image:${user.id}`, 10);
  if (!rl.allowed) return fail("RATE_LIMITED", "Image generation limit reached. Try again later.", 429);

  const flag = await db.featureFlag.findUnique({ where: { key: "image_generation" } });
  if (flag && !flag.enabled) return fail("TOOL_DISABLED", "Image generation is disabled by the administrator.", 403);

  const body = await readJson<{ prompt?: string; size?: string }>(req).catch(() => null);
  const prompt = body?.prompt?.trim();
  if (!prompt) return fail("INVALID_INPUT", "prompt is required.", 400);
  const sizes = ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"] as const;
  const size = (sizes as readonly string[]).includes(body?.size || "") ? body!.size : "1024x1024";

  const started = Date.now();
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const result = await zai.images.generations.create({ prompt: prompt.slice(0, 1000), size: size as (typeof sizes)[number] });
    const b64 = result?.data?.[0]?.base64;
    if (!b64) return fail("IMAGE_GEN_EMPTY", "Image generation returned no image.", 502);
    await db.usageLog.create({ data: { userId: user.id, providerSlug: "afg-cloud", modelSlug: "tool:image-gen", kind: "image", latencyMs: Date.now() - started, success: true } });
    return json({ ok: true, imageBase64: b64, size });
  } catch (err) {
    await logError({ userId: user.id, scope: "system", code: "IMAGE_GEN_FAILED", message: err instanceof Error ? err.message : String(err) });
    return fail("IMAGE_GEN_UNAVAILABLE", "Image generation is unavailable right now.", 503);
  }
});
