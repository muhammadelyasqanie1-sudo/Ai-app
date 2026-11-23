import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handler, fail } from "@/lib/afg/api";
import { requireUser } from "@/lib/afg/auth";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/** GET /api/files/[id] — authenticated private attachment download. */
export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment || (attachment.userId !== user.id && user.role !== "ADMIN")) {
    return fail("NOT_FOUND", "Attachment not found.", 404);
  }
  const absPath = path.join(process.cwd(), attachment.storagePath);
  const uploadsDir = path.join(process.cwd(), "db", "uploads");
  const resolvedUploads = path.resolve(uploadsDir);
  const resolved = path.resolve(absPath);
  if (!resolved.startsWith(resolvedUploads)) {
    return fail("FORBIDDEN", "Invalid path.", 403);
  }
  try {
    const buf = await readFile(resolved);
    // Download-only hardening: never render stored content inline in the browser.
    // Fixed octet-stream type + nosniff + sandboxed CSP neutralize stored XSS.
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return fail("GONE", "File content is no longer available.", 410);
  }
});
