import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "./database.ts";
import {
  authenticateRequest,
  verifyCsrf,
  readJsonBody,
  sendAuthJson,
} from "./auth.ts";
import {
  availableTools,
  validatePlan,
  requiresApproval,
  type Tool,
} from "../services/agents/registry.ts";
import { kick, cancelLocal, event, limits } from "../services/agents/engine.ts";
const create = z
  .object({
    objective: z.string().trim().min(1).max(4000),
    model: z.string().min(1).max(300),
    requestKey: z.uuid(),
    plan: z.unknown().optional(),
  })
  .strict();
export async function handleAgentsApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (!path.startsWith("/api/agents")) return false;
  const requestId = randomUUID();
  const reply = (status: number, body: object) => {
    res.setHeader("Cache-Control", "no-store");
    sendAuthJson(res, status, { ...body, requestId });
  };
  if (!pool) {
    reply(503, {
      error: "Agent storage requires PostgreSQL and migration 0049.",
    });
    return true;
  }
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      reply(401, { error: "Sign in to use agents." });
      return true;
    }
    if (req.method !== "GET" && !verifyCsrf(req)) {
      reply(403, { error: "CSRF validation failed." });
      return true;
    }
    if (path === "/api/agents/tools" && req.method === "GET") {
      reply(200, {
        tools: (await availableTools(user.id)).map((tool) => ({
          tool,
          approval: requiresApproval(tool),
        })),
        limits,
      });
      return true;
    }
    if (path === "/api/agents/tasks" && req.method === "GET") {
      kick();
      reply(200, {
        tasks: (
          await pool.query(
            "SELECT id,objective,model,status,error,created_at,updated_at FROM agent_tasks WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50",
            [user.id],
          )
        ).rows,
      });
      return true;
    }
    if (path === "/api/agents/tasks" && req.method === "POST") {
      const body = create.parse(await readJsonBody(req, 30000));
      const plan =
        body.plan === undefined
          ? null
          : validatePlan(body.plan, await availableTools(user.id));
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            objective: body.objective,
            model: body.model,
            plan,
          }),
        )
        .digest("hex");
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT pg_advisory_xact_lock(7117001)");
        const existing = (
          await db.query(
            "SELECT * FROM agent_tasks WHERE user_id=$1 AND request_key=$2",
            [user.id, body.requestKey],
          )
        ).rows[0];
        if (existing) {
          if (existing.input_hash !== fingerprint) {
            await db.query("ROLLBACK");
            reply(409, {
              error: "Idempotency key was already used with different input.",
            });
            return true;
          }
          await db.query("COMMIT");
          reply(200, { task: existing });
          return true;
        }
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
          reply(429, { error: "Agent queue or daily creation limit reached." });
          return true;
        }
        const task = (
          await db.query(
            "INSERT INTO agent_tasks(user_id,request_key,objective,model,plan,input_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              user.id,
              body.requestKey,
              body.objective,
              body.model,
              plan ? JSON.stringify(plan) : null,
              fingerprint,
            ],
          )
        ).rows[0];
        if (plan)
          for (const [i, s] of plan.steps.entries())
            await db.query(
              "INSERT INTO agent_steps(task_id,position,agent,tool,input) VALUES($1,$2,$3,$4,$5)",
              [task.id, i, s.agent, s.tool, JSON.stringify(s.input)],
            );
        await event(db, task.id, "created");
        await db.query("COMMIT");
        reply(201, { task });
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      return true;
    }
    const match = path.match(
      /^\/api\/agents\/tasks\/([0-9a-f-]{36})(?:\/(start|cancel|resume|approve))?$/i,
    );
    if (!match) {
      reply(404, { error: "Agent route not found." });
      return true;
    }
    const [, , action] = match;
    const id = match[1];
    const task = (
      await pool.query("SELECT * FROM agent_tasks WHERE id=$1 AND user_id=$2", [
        id,
        user.id,
      ])
    ).rows[0];
    if (!task) {
      reply(404, { error: "Task not found." });
      return true;
    }
    if (req.method === "GET" && !action) {
      const steps = (
        await pool.query(
          "SELECT * FROM agent_steps WHERE task_id=$1 ORDER BY position",
          [id],
        )
      ).rows;
      const events = (
        await pool.query(
          "SELECT * FROM agent_events WHERE task_id=$1 ORDER BY id DESC LIMIT 200",
          [id],
        )
      ).rows;
      reply(200, { task, steps, events });
      return true;
    }
    if (req.method !== "POST" || !action) {
      reply(405, { error: "Method not allowed." });
      return true;
    }
    const approval =
      action === "approve"
        ? z
            .object({ stepId: z.uuid(), approved: z.literal(true) })
            .strict()
            .parse(await readJsonBody(req))
        : null;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      if (action !== "cancel") {
        const lock = (
          await db.query(
            "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok",
            ["afg-agent:" + id],
          )
        ).rows[0].ok;
        if (!lock) {
          await db.query("ROLLBACK");
          reply(409, { error: "Task is still executing." });
          return true;
        }
      }
      const current = (
        await db.query(
          "SELECT * FROM agent_tasks WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, user.id],
        )
      ).rows[0];
      if (action === "cancel") {
        if (["completed", "cancelled"].includes(current.status)) {
          await db.query("ROLLBACK");
          reply(409, { error: "Task is already terminal." });
          return true;
        }
        await db.query(
          "UPDATE agent_tasks SET status='cancelled',updated_at=now() WHERE id=$1",
          [id],
        );
        await db.query(
          "UPDATE agent_steps SET status='cancelled' WHERE task_id=$1 AND status<>'completed'",
          [id],
        );
        cancelLocal(id);
      } else if (action === "approve") {
        const body = approval!;
        const step = await db.query(
          "UPDATE agent_steps SET approved_at=now(),status='ready' WHERE id=$1 AND task_id=$2 AND status='waiting_for_approval' RETURNING id",
          [body.stepId, id],
        );
        if (!step.rowCount || current.status !== "waiting_for_approval")
          throw new Error("Invalid approval.");
        await db.query(
          "INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'agent.step.approved','agent_task',$2,$3)",
          [user.id, id, JSON.stringify({ stepId: body.stepId, requestId })],
        );
        await db.query(
          "UPDATE agent_tasks SET status='ready',updated_at=now() WHERE id=$1",
          [id],
        );
      } else {
        if (!current.plan && current.planning_attempts >= limits.maxAttempts)
          throw new Error("Planning retry limit reached.");
        if (action === "start" && current.status !== "draft")
          throw new Error("Task is not draft.");
        if (
          action === "resume" &&
          !["failed", "running"].includes(current.status)
        )
          throw new Error("Task cannot resume.");
        const attempts = await db.query(
          "SELECT max(attempts)::int AS n FROM agent_steps WHERE task_id=$1 AND status<>'completed'",
          [id],
        );
        if ((attempts.rows[0].n || 0) >= limits.maxAttempts)
          throw new Error("Retry limit reached.");
        await db.query(
          "UPDATE agent_steps SET status='ready',error=NULL,approved_at=NULL WHERE task_id=$1 AND status IN ('failed','running')",
          [id],
        );
        await db.query(
          "UPDATE agent_tasks SET status='ready',error=NULL,updated_at=now() WHERE id=$1",
          [id],
        );
      }
      await event(db, id, action);
      await db.query("COMMIT");
      reply(200, { accepted: true });
      kick();
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  } catch (e) {
    reply(
      e instanceof z.ZodError
        ? 400
        : ["42P01", "42703", "ECONNREFUSED", "57P01"].includes((e as any)?.code)
          ? 503
          : 409,
      {
        error:
          e instanceof z.ZodError
            ? "Invalid agent input."
            : "Agent operation unavailable. Check task state, database migration and configured tools.",
      },
    );
  }
  return true;
}
