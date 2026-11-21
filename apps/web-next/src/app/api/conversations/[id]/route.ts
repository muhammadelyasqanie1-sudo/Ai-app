import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { requireUser, signShareId, verifyShareId } from "@/lib/afg/auth";
import { logAudit } from "@/lib/afg/logs";
import { conversationUpdateSchema, formatZodError } from "@/lib/afg/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function getOwnedConversation(id: string, userId: string) {
  const conv = await db.conversation.findUnique({ where: { id }, include: { user: true } });
  if (!conv) return null;
  if (conv.userId !== userId) return null;
  return conv;
}

/** GET — full conversation with messages. */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const conv = await getOwnedConversation(id, user.id);
  if (!conv) return fail("NOT_FOUND", "Conversation not found.", 404);
  const messages = await db.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    include: { attachments: { select: { id: true, filename: true, mimetype: true, size: true, kind: true } } },
  });
  return json({
    conversation: {
      id: conv.id,
      title: conv.title,
      modelSlug: conv.modelSlug,
      systemPrompt: conv.systemPrompt,
      memoryEnabled: conv.memoryEnabled,
      archived: conv.archived,
      shareId: conv.shareId,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      modelSlug: m.modelSlug,
      status: m.status,
      error: m.error,
      toolName: m.toolName,
      toolPayload: m.toolPayload ? JSON.parse(m.toolPayload) : null,
      attachments: m.attachments,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

/** PATCH — rename, archive, switch model, share. */
export const PATCH = handler(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const conv = await getOwnedConversation(id, user.id);
  if (!conv) return fail("NOT_FOUND", "Conversation not found.", 404);
  const body = conversationUpdateSchema.safeParse(await readJson(req));
  if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);

  const data: Record<string, unknown> = {};
  if (body.data.title !== undefined) data.title = body.data.title;
  if (body.data.archived !== undefined) data.archived = body.data.archived;
  if (body.data.modelSlug !== undefined) data.modelSlug = body.data.modelSlug;
  if (body.data.systemPrompt !== undefined) data.systemPrompt = body.data.systemPrompt;
  if (body.data.memoryEnabled !== undefined) data.memoryEnabled = body.data.memoryEnabled;
  if (body.data.share === "enable") data.shareId = signShareId(conv.id);
  if (body.data.share === "disable") data.shareId = null;

  const updated = await db.conversation.update({ where: { id: conv.id }, data });
  if (body.data.share) {
    await logAudit({ actorId: user.id, action: body.data.share === "enable" ? "conversation.share_enabled" : "conversation.share_disabled", target: conv.id });
  }
  return json({ conversation: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } });
});

/** DELETE — permanently remove the conversation and its messages. */
export const DELETE = handler(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const conv = await getOwnedConversation(id, user.id);
  if (!conv) return fail("NOT_FOUND", "Conversation not found.", 404);
  await db.conversation.delete({ where: { id: conv.id } });
  await logAudit({ actorId: user.id, action: "conversation.delete", target: conv.id });
  return json({ ok: true });
});
