import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { requireUser } from "@/lib/afg/auth";
import { rateLimit } from "@/lib/afg/rate-limit";
import { config } from "@/lib/afg/config";
import { logError } from "@/lib/afg/logs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Voice endpoints backed by the platform speech services.
 *  - mode=tts: text → synthesized audio (returns base64 wav/mp3)
 *  - mode=asr: audio upload → transcript
 * The client also uses the browser Web Speech API when available; this
 * endpoint provides server-side synthesis/recognition with graceful,
 * honest failure when the service is unavailable.
 */

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const rl = await rateLimit(`voice:${user.id}`, config.limits.toolPerHour);
  if (!rl.allowed) return fail("RATE_LIMITED", "Voice rate limit reached. Try again later.", 429);

  const contentType = req.headers.get("content-type") || "";

  // ---------------------------------------------------------- ASR (upload)
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof File)) return fail("INVALID_BODY", "Missing audio field.", 400);
    if (audio.size > 10 * 1024 * 1024) return fail("FILE_TOO_LARGE", "Audio must be under 10 MB.", 413);
    try {
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      const zai = await ZAI.create();
      const b64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
      const result = await zai.audio.asr.create({ file_base64: b64 });
      const text = result?.text || result?.data?.text || "";
      if (!text) return fail("NO_SPEECH", "No speech detected in the recording.", 422);
      await db.usageLog.create({ data: { userId: user.id, providerSlug: "afg-cloud", modelSlug: "tool:asr", kind: "asr", success: true } });
      return json({ ok: true, text });
    } catch (err) {
      await logError({ userId: user.id, scope: "system", code: "ASR_FAILED", message: err instanceof Error ? err.message : String(err) });
      return fail("ASR_UNAVAILABLE", "Speech recognition is unavailable right now.", 503);
    }
  }

  // ---------------------------------------------------------- TTS (json)
  const body = await readJson<{ text?: string; speed?: number; voice?: string }>(req).catch(() => null);
  if (!body?.text?.trim()) return fail("INVALID_INPUT", "text is required.", 400);
  const text = body.text.slice(0, 4000);
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const result = await zai.audio.tts.create({
      input: text,
      voice: body.voice || "tongtong",
      speed: Math.min(Math.max(body.speed || 1, 0.5), 2),
      response_format: "wav",
    });
    let audioBase64: string | null = null;
    if (typeof result === "string") {
      audioBase64 = result;
    } else if (result?.audio_base64) {
      audioBase64 = result.audio_base64;
    } else if (result?.data) {
      audioBase64 = Buffer.from(result.data).toString("base64");
    }
    if (!audioBase64) return fail("TTS_EMPTY", "Speech synthesis returned no audio.", 502);
    await db.usageLog.create({ data: { userId: user.id, providerSlug: "afg-cloud", modelSlug: "tool:tts", kind: "tts", tokensIn: estimateTokens(text), success: true } });
    return json({ ok: true, audioBase64, format: "wav" });
  } catch (err) {
    await logError({ userId: user.id, scope: "system", code: "TTS_FAILED", message: err instanceof Error ? err.message : String(err) });
    return fail("TTS_UNAVAILABLE", "Speech synthesis is unavailable right now. Browser voice will be used if present.", 503);
  }
});

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
