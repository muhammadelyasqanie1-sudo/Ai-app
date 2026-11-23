import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail } from "@/lib/afg/api";
import { verifyShareId } from "@/lib/afg/auth";

export const dynamic = "force-dynamic";

/** GET /api/share/[shareId] — public, read-only shared conversation. */
export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ shareId: string }> }) => {
  const { shareId } = await ctx.params;
  const conversationId = verifyShareId(shareId);
  if (!conversationId) return fail("NOT_FOUND", "Share link is invalid or was revoked.", 404);

  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });
  if (!conv || !conv.shareId || conv.shareId !== shareId) {
    return fail("NOT_FOUND", "Share link is invalid or was revoked.", 404);
  }
  return json({
    conversation: { title: conv.title, createdAt: conv.createdAt.toISOString() },
    messages: conv.messages.filter((m) => m.role === "user" || m.role === "assistant"),
  });
});
