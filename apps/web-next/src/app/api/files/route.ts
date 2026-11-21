import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail } from "@/lib/afg/api";
import { requireUser } from "@/lib/afg/auth";
import { rateLimit } from "@/lib/afg/rate-limit";
import { config } from "@/lib/afg/config";
import { logError } from "@/lib/afg/logs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "text/plain", "text/markdown", "text/csv", "application/json",
  "application/pdf", "text/x-python", "text/javascript", "application/x-yaml", "text/html",
];

function kindForMime(mime: string): "image" | "text" | "data" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/json" || mime === "text/csv") return "data";
  if (mime.startsWith("text/") || mime === "application/x-yaml") return "text";
  return "file";
}

/** Magic-byte validation so a renamed executable cannot pass as an image. */
function hasValidMagic(buf: Buffer, mime: string): boolean {
  if (!mime.startsWith("image/")) return true;
  if (mime === "image/png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === "image/gif") return buf.subarray(0, 3).toString() === "GIF";
  if (mime === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return true;
}

/** POST /api/files — validated upload pipeline (private storage, quarantined names). */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const rl = await rateLimit(`upload:${user.id}`, config.limits.uploadPerHour);
  if (!rl.allowed) return fail("RATE_LIMITED", "Upload limit reached. Try again later.", 429);

  const form = await req.formData().catch(() => null);
  if (!form) return fail("INVALID_BODY", "Expected multipart form data.", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return fail("INVALID_BODY", "Missing file field.", 400);
  if (file.size === 0) return fail("INVALID_FILE", "Empty file rejected.", 400);
  if (file.size > config.uploads.maxBytes) {
    return fail("FILE_TOO_LARGE", `Maximum upload size is ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB.`, 413);
  }
  const mimetype = (file.type || "application/octet-stream").toLowerCase();
  const ext = path.extname(file.name || "").toLowerCase();
  const allowedByExt = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".md", ".csv", ".json", ".pdf", ".py", ".js", ".ts", ".yaml", ".yml", ".html"]
    .includes(ext);
  if (!ALLOWED_MIME.includes(mimetype) && !allowedByExt) {
    return fail("UNSUPPORTED_TYPE", `File type ${mimetype || ext || "unknown"} is not supported.`, 415);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasValidMagic(buf, mimetype)) {
    return fail("INVALID_FILE", "File content does not match its declared type.", 415);
  }

  const dir = path.join(process.cwd(), config.uploads.dir);
  await mkdir(dir, { recursive: true });
  const safeName = (file.name || "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload";
  const stored = `${crypto.randomBytes(8).toString("hex")}-${safeName}`;
  const storagePath = path.join(config.uploads.dir, stored);
  await writeFile(path.join(process.cwd(), storagePath), buf);

  const attachment = await db.attachment.create({
    data: {
      userId: user.id,
      filename: safeName,
      mimetype,
      size: buf.length,
      storagePath,
      kind: kindForMime(mimetype),
    },
  });

  return json({
    attachment: {
      id: attachment.id,
      filename: attachment.filename,
      mimetype: attachment.mimetype,
      size: attachment.size,
      kind: attachment.kind,
    },
  }, { status: 201 });
});

/** GET /api/files — list current user's attachments. */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const attachments = await db.attachment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, filename: true, mimetype: true, size: true, kind: true, createdAt: true, messageId: true },
  });
  return json({ attachments });
});
