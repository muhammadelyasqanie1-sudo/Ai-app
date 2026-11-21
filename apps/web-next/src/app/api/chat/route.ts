import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail } from "@/lib/afg/api";
import { requireUser, clientIp } from "@/lib/afg/auth";
import { rateLimit } from "@/lib/afg/rate-limit";
import { config } from "@/lib/afg/config";
import { logError, logAudit } from "@/lib/afg/logs";
import { chatRequestSchema, formatZodError } from "@/lib/afg/validate";
import {
  ensureProvidersSeeded,
  buildModelChain,
  getProviderAdapter,
  refreshProviderCatalog,
  ApiChatMessage,
  StreamEvent,
} from "@/lib/afg/providers";
import { runTool, formatToolContext, webSearch } from "@/lib/afg/tools";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEM_BASE = `You are AFG AI — "One AI. Many capabilities. One intelligent platform."
You are precise, honest and helpful. Use Markdown formatting. Fence code blocks with the language tag.
If you are unsure or a tool failed, say so plainly. Never invent sources or data.`;

const UTF8_TEXT = /^(text\/|application\/(json|xml|javascript|x-yaml|csv))/;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail("UNAUTHENTICATED", "Sign in required.", 401);
  }

  const limitKey = user.isGuest ? `chat:guest:${user.id}` : `chat:${user.id}`;
  const limit = user.isGuest ? config.limits.guestChatPerHour : config.limits.chatPerHour;
  const rl = await rateLimit(limitKey, limit);
  if (!rl.allowed) {
    return fail("RATE_LIMITED", "Chat rate limit reached. Try again later.", 429, { resetAt: rl.resetAt });
  }

  let body;
  try {
    const raw = await req.json();
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) return fail("INVALID_INPUT", formatZodError(parsed.error), 400);
    body = parsed.data;
  } catch {
    return fail("INVALID_BODY", "Invalid JSON body.", 400);
  }

  const conv = await db.conversation.findUnique({ where: { id: body.conversationId } });
  if (!conv || conv.userId !== user.id) return fail("NOT_FOUND", "Conversation not found.", 404);

  await ensureProvidersSeeded();
  const requestSignal = req.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const startedAt = Date.now();
      let assistantId: string | null = null;
      let persisted = false;

      const persistAssistant = async (content: string, status: "COMPLETE" | "STOPPED" | "ERROR", modelSlug: string, tokensIn: number, tokensOut: number, error?: string) => {
        if (persisted) return;
        persisted = true;
        try {
          if (assistantId) {
            await db.message.update({
              where: { id: assistantId },
              data: { content, status, error: error || null, tokensIn, tokensOut, latencyMs: Date.now() - startedAt },
            });
          }
          await db.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
        } catch (err) {
          await logError({ userId: user.id, scope: "chat", code: "PERSIST_FAILED", message: err instanceof Error ? err.message : String(err) });
        }
      };

      try {
        // ------------------------------------------------------------
        // 1. Prepare the user turn (new / regenerate / edit-resend)
        // ------------------------------------------------------------
        let history = await db.message.findMany({
          where: { conversationId: conv.id },
          orderBy: { createdAt: "asc" },
          include: { attachments: true },
        });

        if (body.resendMessageId) {
          // Edit & resend: truncate everything after the edited message, replace its content
          const idx = history.findIndex((m) => m.id === body.resendMessageId);
          if (idx === -1) throw new Error("Message to edit was not found");
          const edited = history[idx];
          await db.message.update({ where: { id: edited.id }, data: { content: body.content || edited.content } });
          await db.message.deleteMany({
            where: { conversationId: conv.id, createdAt: { gt: edited.createdAt } },
          });
          history = history.slice(0, idx + 1);
          const count = await db.message.count({ where: { conversationId: conv.id } });
          await db.conversation.update({ where: { id: conv.id }, data: { messageCount: count } });
        } else if (body.regenerate) {
          // Remove the last assistant message and re-run the same user turn
          const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
          if (lastAssistant) {
            await db.message.delete({ where: { id: lastAssistant.id } });
            history = history.filter((m) => m.id !== lastAssistant.id);
          }
          const count = await db.message.count({ where: { conversationId: conv.id } });
          await db.conversation.update({ where: { id: conv.id }, data: { messageCount: count } });
        } else {
          if (!body.content || !body.content.trim()) throw new Error("Message content is required");
          if (body.attachmentIds?.length) {
            await db.attachment.updateMany({
              where: { id: { in: body.attachmentIds }, userId: user.id, messageId: null },
              data: { messageId: null },
            });
          }
          const userMessage = await db.message.create({
            data: { conversationId: conv.id, role: "user", content: body.content },
          });
          if (body.attachmentIds?.length) {
            await db.attachment.updateMany({
              where: { id: { in: body.attachmentIds }, userId: user.id },
              data: { messageId: userMessage.id },
            });
          }
          history.push({ ...userMessage, attachments: [] });

          // Auto-title from first exchange
          if (conv.title === "New conversation" || !conv.title) {
            const title = body.content.trim().slice(0, 60).replace(/\s+\S*$/, "") || "New conversation";
            await db.conversation.update({ where: { id: conv.id }, data: { title } });
          }
        }

        const userTurn = history[history.length - 1];
        const turnAttachments = body.attachmentIds?.length && !body.regenerate && !body.resendMessageId
          ? await db.attachment.findMany({ where: { id: { in: body.attachmentIds }, userId: user.id } })
          : userTurn.attachments || [];
        const needsVision = turnAttachments.some((a) => a.kind === "image");

        // ------------------------------------------------------------
        // 2. Model resolution (chain with optional fallback)
        // ------------------------------------------------------------
        const requestedSlug = body.modelSlug || conv.modelSlug;
        let chain = await buildModelChain(requestedSlug, body.allowFallback !== false, needsVision);
        if (chain.length === 0) {
          // Catalog may be cold: attempt a live refresh, then resolve again
          const { ensureAfgCloudModels } = await import("@/lib/afg/bootstrap");
          await ensureAfgCloudModels();
          chain = await buildModelChain(requestedSlug, true, needsVision);
        }
        if (chain.length === 0) {
          send({ type: "error", message: "No AI model is currently available. Check provider status in Settings or Admin." });
          controller.close();
          return;
        }

        // ------------------------------------------------------------
        // 3. Optional tool grounding (real execution, real status)
        // ------------------------------------------------------------
        let toolNote: { tool: string; summary: string; ok: boolean } | null = null;
        if (body.webSearch && body.content) {
          send({ type: "tool", tool: "web_search", status: "running" });
          const result = await webSearch(body.content, 6);
          toolNote = { tool: "web_search", summary: result.ok ? result.summary : result.error, ok: result.ok };
          send({ type: "tool", tool: "web_search", status: result.ok ? "done" : "error", summary: toolNote.summary, results: result.ok ? result.data : undefined });
        }

        // ------------------------------------------------------------
        // 4. Build provider messages within the context budget
        // ------------------------------------------------------------
        const preferred = chain[0];
        const caps: string[] = JSON.parse(preferred.model.capabilities || "[]");
        const budgetChars = (preferred.model.contextWindow || config.unknownContextBudget) * 3.2; // chars ≈ tokens*4, leave headroom

        const systemParts: string[] = [SYSTEM_BASE];
        if (conv.systemPrompt?.trim()) systemParts.push(`Operator instructions: ${conv.systemPrompt.trim()}`);
        if (conv.memoryEnabled) systemParts.push("Conversation memory is ON: use earlier turns for continuity.");
        else systemParts.push("Conversation memory is OFF: only the latest user turn matters; do not reference earlier context.");
        if (toolNote && toolNote.ok) {
          const result = await webSearch(body.content!, 6);
          systemParts.push(formatToolContext("web_search", result));
        }
        const systemPrompt = systemParts.join("\n\n");

        // Truncate history to fit budget
        const kept: typeof history = [];
        let used = systemPrompt.length + (body.content?.length || 0);
        for (let i = history.length - 1; i >= 0; i--) {
          const m = history[i];
          used += m.content.length;
          if (used > budgetChars && kept.length > 0) break;
          kept.unshift(m);
        }

        const apiMessages: ApiChatMessage[] = [{ role: "system", content: systemPrompt }];
        for (const m of kept) {
          apiMessages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
        }

        // Vision: build multimodal content for the final user turn
        const imageAttachments = turnAttachments.filter((a) => a.kind === "image");
        if (needsVision && caps.includes("vision") && imageAttachments.length > 0) {
          const lastUser = apiMessages[apiMessages.length - 1];
          const contentItems: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
            { type: "text", text: lastUser.content || "Describe the attached image(s)." },
          ];
          for (const a of imageAttachments.slice(0, 3)) {
            try {
              const buf = await readFile(path.join(process.cwd(), a.storagePath));
              contentItems.push({ type: "image_url", image_url: { url: `data:${a.mimetype};base64,${buf.toString("base64")}` } });
            } catch {
              // Missing file: skip silently; the model still answers from text
            }
          }
          (lastUser as unknown as { content: unknown }).content = contentItems;
        }

        // Text/data attachments: inline the extracted content into the last user turn
        const dataAttachments = turnAttachments.filter((a) => a.kind === "text" || a.kind === "data");
        if (dataAttachments.length > 0 && apiMessages.length > 0) {
          const last = apiMessages[apiMessages.length - 1];
          for (const a of dataAttachments.slice(0, 3)) {
            try {
              if (UTF8_TEXT.test(a.mimetype) || a.kind === "data") {
                const buf = await readFile(path.join(process.cwd(), a.storagePath), "utf8");
                last.content += `\n\n[Attached file: ${a.filename}]\n${buf.slice(0, 20000)}`;
              }
            } catch { /* skip unreadable attachment */ }
          }
        }

        // ------------------------------------------------------------
        // 5. Stream with retry/fallback — persist exactly what happened
        // ------------------------------------------------------------
        const created = await db.message.create({
          data: { conversationId: conv.id, role: "assistant", content: "", modelSlug: preferred.model.slug, status: "COMPLETE" },
        });
        assistantId = created.id;
        const streamAssistantId: string = created.id;

        const count = await db.message.count({ where: { conversationId: conv.id } });
        await db.conversation.update({ where: { id: conv.id }, data: { messageCount: count } });

        send({
          type: "meta",
          messageId: streamAssistantId,
          conversationId: conv.id,
          model: preferred.model.slug,
          modelLabel: preferred.model.displayName,
          provider: preferred.provider.name,
          chain: chain.map((c) => c.model.slug),
        });

        let fullText = "";
        let tokensIn = 0;
        let tokensOut = 0;
        let usedSlug = preferred.model.slug;
        let lastError: string | null = null;

        for (let attempt = 0; attempt < chain.length; attempt++) {
          const ref = chain[attempt];
          const adapter = await getProviderAdapter(ref.provider);
          if (attempt > 0) {
            send({ type: "fallback", from: usedSlug, to: ref.model.slug, reason: lastError || undefined });
            usedSlug = ref.model.slug;
            await db.message.update({ where: { id: streamAssistantId }, data: { modelSlug: ref.model.slug } });
          }
          let produced = false;
          try {
            for await (const evt of adapter.streamChat({
              model: ref.model.modelId,
              messages: apiMessages,
              signal: requestSignal,
            }) as AsyncGenerator<StreamEvent>) {
              if (requestSignal.aborted) break;
              if (evt.type === "delta") {
                produced = true;
                fullText += evt.text;
                send({ type: "delta", text: evt.text });
              } else if (evt.type === "usage") {
                tokensIn += evt.tokensIn;
                tokensOut += evt.tokensOut;
              } else if (evt.type === "error") {
                lastError = evt.message;
              }
            }
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }

          if (requestSignal.aborted) {
            await persistAssistant(fullText, "STOPPED", usedSlug, tokensIn, tokensOut);
            send({ type: "stopped", messageId: assistantId, model: usedSlug, tokensIn, tokensOut });
            await db.usageLog.create({
              data: { userId: user.id, providerSlug: ref.provider.slug, modelSlug: usedSlug, kind: "chat", tokensIn, tokensOut, latencyMs: Date.now() - startedAt, success: false },
            });
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
            return;
          }

          if (produced && fullText.trim().length > 0) {
            await persistAssistant(fullText, "COMPLETE", usedSlug, tokensIn, tokensOut);
            send({ type: "done", messageId: assistantId, model: usedSlug, tokensIn, tokensOut, latencyMs: Date.now() - startedAt });
            await db.usageLog.create({
              data: { userId: user.id, providerSlug: ref.provider.slug, modelSlug: usedSlug, kind: "chat", tokensIn, tokensOut, latencyMs: Date.now() - startedAt, success: true },
            });
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
            return;
          }

          if (lastError) {
            await logError({ userId: user.id, scope: "chat", code: "PROVIDER_STREAM_FAILED", message: lastError, meta: { provider: ref.provider.slug, model: ref.model.slug } });
          }
          if (attempt === 0 && !produced) {
            // Trigger a real health check for the failing provider before falling back
            refreshProviderCatalog(ref.provider).catch(() => null);
          }
        }

        await persistAssistant(fullText, "ERROR", usedSlug, tokensIn, tokensOut, lastError ?? undefined);
        send({ type: "error", message: lastError || "All available models failed. Verify provider configuration and connectivity." });
        await db.usageLog.create({
          data: { userId: user.id, providerSlug: chain[0].provider.slug, modelSlug: usedSlug, kind: "chat", tokensIn, tokensOut, latencyMs: Date.now() - startedAt, success: false },
        });
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logError({ userId: user.id, scope: "chat", code: "CHAT_HANDLER_FAILED", message });
        await persistAssistant("", "ERROR", conv.modelSlug, 0, 0, message || undefined);
        send({ type: "error", message: message.startsWith("Message") || message.startsWith("No AI") ? message : "The chat request failed. Please try again." });
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
