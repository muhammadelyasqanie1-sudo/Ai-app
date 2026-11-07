import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { pool } from "../../api/database.ts";
import {
  ensureQuarantineDirectory,
  MAX_UPLOAD_BYTES,
  quarantineUpload,
} from "../../security/upload.ts";
import type { MediaInput } from "./contracts.ts";

export const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".mp4": "video/mp4",
};
export async function privateBytes(
  file: any,
  approved = true,
): Promise<Buffer> {
  if (approved && file.status !== "approved")
    throw new Error("File requires security scanner approval.");
  const root = await ensureQuarantineDirectory();
  if (path.dirname(path.resolve(file.storage_key)) !== root)
    throw new Error("Invalid private storage reference.");
  const handle = await open(
    file.storage_key,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size < 1 ||
      info.size > MAX_UPLOAD_BYTES ||
      info.size !== Number(file.size_bytes)
    )
      throw new Error("Invalid private file.");
    const bytes = await handle.readFile();
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error("File integrity check failed.");
    return bytes;
  } finally {
    await handle.close();
  }
}
export async function ownedInputs(
  userId: string,
  ids: string[],
): Promise<MediaInput[]> {
  const inputs: MediaInput[] = [];
  for (const id of ids) {
    const found = await pool!.query(
      "SELECT * FROM files WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    if (!found.rowCount) throw new Error("Input file not found.");
    inputs.push({
      bytes: await privateBytes(found.rows[0]),
      mime: found.rows[0].mime,
      name: found.rows[0].original_name,
    });
  }
  return inputs;
}
let scanning = 0;
export function scannerConfigured() {
  return Boolean(
    process.env.AFG_CLAMSCAN_PATH &&
      path.isAbsolute(process.env.AFG_CLAMSCAN_PATH),
  );
}
/** Scan verified bytes via stdin. No filename, prompt, or uploaded content becomes a shell argument. */
export async function scanOwnedFile(
  userId: string,
  id: string,
  signal?: AbortSignal,
) {
  if (!scannerConfigured())
    throw new Error(
      "Configure AFG_CLAMSCAN_PATH to an absolute ClamAV clamscan executable; uploads remain quarantined.",
    );
  if (scanning >= 2) throw new Error("Security scanner is busy. Try again.");
  scanning++;
  try {
    const found = await pool!.query(
      "SELECT * FROM files WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    if (!found.rowCount) return null;
    const file = found.rows[0];
    if (file.status === "rejected")
      throw new Error("File was rejected by the security scanner.");
    if (file.status === "approved") return { id, status: "approved" };
    const bytes = await privateBytes(file, false);
    const status = await new Promise<"approved" | "rejected">(
      (resolve, reject) => {
        const child = spawn(
          process.env.AFG_CLAMSCAN_PATH!,
          [
            "--no-summary",
            "--stdout",
            "--max-filesize=16M",
            "--max-scansize=32M",
            "--max-files=100",
            "--max-recursion=8",
            "--alert-exceeds-max=yes",
            ...(process.env.AFG_CLAMSCAN_DATABASE?.startsWith("/")
              ? ["--database=" + process.env.AFG_CLAMSCAN_DATABASE]
              : []),
            "-",
          ],
          {
            stdio: ["pipe", "ignore", "ignore"],
            signal: AbortSignal.any([
              AbortSignal.timeout(30000),
              ...(signal ? [signal] : []),
            ]),
          },
        );
        child.stdin.on("error", () => {});
        child.on("error", () =>
          reject(
            new Error(
              "Security scanner is unavailable; no approval was granted.",
            ),
          ),
        );
        child.on("close", (code) =>
          code === 0
            ? resolve("approved")
            : code === 1
              ? resolve("rejected")
              : reject(
                  new Error("Security scan failed; no approval was granted."),
                ),
        );
        child.stdin.end(bytes);
      },
    );
    const db = await pool!.connect();
    try {
      await db.query("BEGIN");
      const changed = await db.query(
        "UPDATE files SET status=$3 WHERE id=$1 AND user_id=$2 AND sha256=$4 AND status='quarantined' RETURNING id",
        [id, userId, status, file.sha256],
      );
      if (!changed.rowCount) throw new Error("File changed during scan.");
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'media.file.scanned','file',$2,$3)",
        [userId, id, JSON.stringify({ status })],
      );
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
    return { id, status };
  } finally {
    scanning--;
  }
}
/** Store provider output in the same quarantine; never serve executable content or bypass scanning. */
export async function saveOutput(
  db: any,
  userId: string,
  jobId: string,
  bytes: Buffer,
  mime: string,
) {
  const extensions: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
  };
  const ext = extensions[mime];
  if (!ext) throw new Error("Provider output format is unsupported.");
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('afg-file-quota:' || $1))",
    [userId],
  );
  const count = await db.query(
    "SELECT count(*)::int AS n,coalesce(sum(size_bytes),0)::bigint AS bytes FROM files WHERE user_id=$1",
    [userId],
  );
  if (
    count.rows[0].n >= 100 ||
    Number(count.rows[0].bytes) + bytes.length > 100 * 1024 * 1024
  )
    throw new Error("Private media storage quota reached.");
  const upload = await quarantineUpload({
    bytes,
    originalName: "generated" + ext,
  });
  try {
    const row = await db.query(
      `INSERT INTO files(user_id,kind,mime,size_bytes,storage_key,original_name,status,sha256,media_job_id)
     VALUES($1,$2,$3,$4,$5,$6,'quarantined',$7,$8) RETURNING id`,
      [
        userId,
        ext.slice(1),
        mime,
        bytes.length,
        upload.quarantinePath,
        "generated" + ext,
        createHash("sha256").update(bytes).digest("hex"),
        jobId,
      ],
    );
    return { id: row.rows[0].id, path: upload.quarantinePath };
  } catch (e) {
    await unlink(upload.quarantinePath).catch(() => {});
    throw e;
  }
}
