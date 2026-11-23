import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { requireUser } from "@/lib/afg/auth";
import { conversationCreateSchema, formatZodError } from "@/lib/afg/validate";

export const dynamic = "force-dynamic";

/** GET /api/conversations — list with search, filter, pagination. */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = req.nextUrl;
  const q = url.searchParams.get("q")?.trim().slice(0, 120) || "";
  const archived = url.searchParams.get("archived") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 60, 100);

  const conversations = await db.conversation.findMany({
    where: {
      userId: user.id,
      archived,
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { messages: { some: { content: { contains: q } } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true } } },
  });

  return json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      modelSlug: c.modelSlug,
      archived: c.archived,
      shareId: c.shareId,
      messageCount: c.messageCount,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      preview: c.messages[0]?.content?.slice(0, 160) || "",
    })),
  });
});

/** POST /api/conversations — create a conversation. */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = conversationCreateSchema.safeParse(await readJson(req).catch(() => ({})));
  if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
  const conv = await db.conversation.create({
    data: {
      userId: user.id,
      title: body.data.title || "New conversation",
      modelSlug: body.data.modelSlug || "afg-cloud-chat",
      systemPrompt: body.data.systemPrompt ?? user.systemPrompt,
      memoryEnabled: body.data.memoryEnabled ?? user.memoryEnabled,
    },
  });
  return json({
    conversation: {
      id: conv.id,
      title: conv.title,
      modelSlug: conv.modelSlug,
      archived: conv.archived,
      shareId: conv.shareId,
      messageCount: 0,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      preview: "",
    },
  }, { status: 201 });
});
