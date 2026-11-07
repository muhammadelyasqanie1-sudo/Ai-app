import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "./database.ts";
import {
  authenticateRequest,
  verifyCsrf,
  readJsonBody,
  sendAuthJson,
} from "./auth.ts";
import { mediaRequest } from "../services/media/contracts.ts";
import {
  mediaModels,
  mediaConfiguration,
  localAvailability,
  validateMedia,
} from "../services/media/engine.ts";
import {
  checkpointPlan,
  event,
  kick,
  limits,
} from "../services/agents/engine.ts";
import { ProviderAdapterError } from "../providers/providerTypes.ts";
export async function handleMediaApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (path !== "/api/media" && !path.startsWith("/api/media/")) return false;
  const requestId = randomUUID();
  const reply = (status: number, body: object) => {
    res.setHeader("Cache-Control", "no-store");
    sendAuthJson(res, status, { ...body, requestId });
  };
  if (!pool) {
    reply(503, {
      error: "Media storage requires PostgreSQL and migration 0050.",
    });
    return true;
  }
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      reply(401, { error: "Sign in to use Media Studio." });
      return true;
    }
    if (req.method !== "GET" && !verifyCsrf(req)) {
      reply(403, { error: "CSRF validation failed." });
      return true;
    }
    if (path === "/api/media/capabilities" && req.method === "GET") {
      reply(200, {
        configuration: { valid: mediaConfiguration().valid },
        models: await mediaModels(user.id),
        local: await localAvailability(),
        unsupported: ["video_generate", "audio_understand"],
        limits: {
          uploadBytes: 15 * 1024 * 1024,
          files: 100,
          storageBytes: 100 * 1024 * 1024,
          dailyJobs: 50,
        },
        notice:
          "Catalogue capabilities are provider-reported. Successful media inference is verified only by an actual job.",
      });
      return true;
    }
    if (path === "/api/media/jobs" && req.method === "GET") {
      kick();
      const url = new URL(req.url || path, "http://localhost");
      const offset = Math.floor(
        Math.min(
          10000,
          Math.max(0, Number(url.searchParams.get("offset")) || 0),
        ),
      );
      const jobs = await pool.query(
        `SELECT j.id,j.task_id,j.request,j.execution_state,j.result,j.usage,j.duration_ms,j.created_at,t.status,t.error FROM media_jobs j JOIN agent_tasks t ON t.id=j.task_id WHERE j.user_id=$1 AND t.user_id=$1 ORDER BY j.created_at DESC,j.id DESC LIMIT 21 OFFSET $2`,
        [user.id, offset],
      );
      reply(200, {
        jobs: jobs.rows.slice(0, 20),
        nextOffset: jobs.rows.length > 20 ? offset + 20 : null,
      });
      return true;
    }
    if (path === "/api/media/jobs" && req.method === "POST") {
      const request = mediaRequest.parse(await readJsonBody(req, 16000));
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex");
      // Serialize admission with the existing agent queue's global quota lock.
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT pg_advisory_xact_lock(7117001)");
        const previous = await db.query(
          "SELECT t.id AS task_id,t.input_hash,j.id FROM agent_tasks t LEFT JOIN media_jobs j ON j.task_id=t.id WHERE t.user_id=$1 AND t.request_key=$2",
          [user.id, request.requestKey],
        );
        if (previous.rowCount) {
          await db.query("ROLLBACK");
          reply(
            previous.rows[0].id && previous.rows[0].input_hash === fingerprint
              ? 200
              : 409,
            previous.rows[0].id && previous.rows[0].input_hash === fingerprint
              ? { job: previous.rows[0] }
              : { error: "Idempotency key already used with different input." },
          );
          return true;
        }
        // Resolve actual ownership and model availability before queueing any external work.
        await validateMedia(user.id, request);
        const count = await db.query(
          "SELECT count(*)::int AS total,count(*) FILTER(WHERE user_id=$1)::int AS own FROM agent_tasks WHERE status IN ('ready','running','waiting_for_approval','draft')",
          [user.id],
        );
        const daily = await db.query(
          "SELECT count(*)::int AS n FROM agent_tasks WHERE user_id=$1 AND created_at>now()-interval '1 day'",
          [user.id],
        );
        if (
          count.rows[0].total >= limits.queued ||
          count.rows[0].own >= limits.perUser ||
          daily.rows[0].n >= 50
        ) {
          await db.query("ROLLBACK");
          reply(429, { error: "Task queue or daily limit reached." });
          return true;
        }
        const task = await db.query(
          `INSERT INTO agent_tasks(user_id,request_key,input_hash,objective,model,status) VALUES($1,$2,$3,$4,$5,'running') RETURNING id`,
          [
            user.id,
            request.requestKey,
            fingerprint,
            "Media: " + request.type,
            request.provider
              ? request.provider + "::" + request.model
              : "local",
          ],
        );
        const job = await db.query(
          "INSERT INTO media_jobs(user_id,task_id,request) VALUES($1,$2,$3) RETURNING id",
          [user.id, task.rows[0].id, JSON.stringify(request)],
        );
        await checkpointPlan(db, task.rows[0].id, {
          steps: [
            {
              agent: "file",
              tool: "media_execute",
              input: { jobId: job.rows[0].id },
              dependsOn: [],
            },
          ],
        });
        await event(db, task.rows[0].id, "media_submitted");
        await db.query("COMMIT");
        kick();
        reply(201, { job: { id: job.rows[0].id, task_id: task.rows[0].id } });
        return true;
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
    }
    const deletion = path.match(
      /^\/api\/media\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    );
    if (deletion && req.method === "DELETE") {
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const job = await db.query(
          "SELECT t.id,t.status FROM media_jobs j JOIN agent_tasks t ON t.id=j.task_id WHERE j.id=$1 AND j.user_id=$2 AND t.user_id=$2 FOR UPDATE OF t",
          [deletion[1], user.id],
        );
        if (!job.rowCount) {
          await db.query("ROLLBACK");
          reply(404, { error: "Media task not found." });
          return true;
        }
        if (
          !["completed", "cancelled", "failed"].includes(job.rows[0].status)
        ) {
          await db.query("ROLLBACK");
          reply(409, {
            error: "Cancel the active task before deleting history.",
          });
          return true;
        }
        await db.query(
          "INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'media.history.deleted','agent_task',$2,'{}')",
          [user.id, job.rows[0].id],
        );
        await db.query("DELETE FROM agent_tasks WHERE id=$1 AND user_id=$2", [
          job.rows[0].id,
          user.id,
        ]);
        await db.query("COMMIT");
        reply(200, { deleted: true });
        return true;
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
    }
    reply(404, { error: "Media route not found." });
    return true;
  } catch (error) {
    if (error instanceof ProviderAdapterError) {
      reply(error.status, { error: error.message, code: error.code });
      return true;
    }
    const { ZodError } = await import("zod");
    if (error instanceof ZodError) {
      reply(400, { error: "Invalid media request." });
      return true;
    }
    // Whitelist only our own validation messages; never serialize SQL, upstream bodies or file paths.
    const message = error instanceof Error ? error.message : "";
    const safe =
      /^(Input file not found\.|File requires security scanner approval\.|No enabled, verified provider|Explicit permission|A prompt|Select |Enter a voice|Voice is only|Language is only|Document analysis is limited|Local extraction|Local extractor|This operation)/.test(
        message,
      );
    reply(safe ? 400 : 503, {
      error: safe
        ? message
        : "Media service is unavailable. Check storage, migrations and provider configuration.",
    });
    return true;
  }
}
