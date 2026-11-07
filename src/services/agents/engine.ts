import { executeBrowserAutomationTool } from "../../api/browserAutomation.ts";
import { pool } from "../../api/database.ts";
import {
  availableTools,
  executeTool,
  infer,
  inputs,
  requiresApproval,
  validatePlan,
  type Tool,
} from "./registry.ts";
import { buildPersonalContextMessage } from "../intelligenceContext.ts";

const globalRuntime = globalThis as typeof globalThis & {
  __afgAgentRuntime?: {
    active: Map<string, AbortController>;
    draining: boolean;
    timer?: ReturnType<typeof setTimeout>;
  };
};
const runtime: NonNullable<typeof globalRuntime.__afgAgentRuntime> =
  (globalRuntime.__afgAgentRuntime ??= {
    active: new Map(),
    draining: false,
  });
const active = runtime.active;
function bounded(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
export const limits = {
  concurrency: bounded(process.env.AFG_AGENT_CONCURRENCY, 2, 1, 2),
  queued: 20,
  perUser: 3,
  steps: 8,
  timeoutMs: bounded(process.env.AFG_AGENT_TIMEOUT_MS, 60000, 1000, 120000),
  maxAttempts: 3,
};
export async function event(
  db: any,
  taskId: string,
  kind: string,
  stepId: string | null = null,
) {
  const record = await db.query(
    "INSERT INTO agent_events(task_id,step_id,kind) VALUES($1,$2,$3) RETURNING request_id",
    [taskId, stepId, kind],
  );
  console.info(
    "AFG_AGENT_EVENT",
    JSON.stringify({
      taskId,
      stepId,
      kind,
      requestId: record.rows[0].request_id,
    }),
  );
}
export async function checkpointPlan(
  db: any,
  taskId: string,
  plan: ReturnType<typeof validatePlan>,
) {
  for (const [i, s] of plan.steps.entries())
    await db.query(
      "INSERT INTO agent_steps(task_id,position,agent,tool,input) VALUES($1,$2,$3,$4,$5)",
      [taskId, i, s.agent, s.tool, JSON.stringify(s.input)],
    );
  await db.query(
    "UPDATE agent_tasks SET plan=$2,status='ready',updated_at=now(),error=NULL WHERE id=$1 AND status='running'",
    [taskId, JSON.stringify(plan)],
  );
  await event(db, taskId, "plan_created");
}
async function run(taskId: string) {
  const db = await pool!.connect();
  const key = "afg-agent:" + taskId;
  let browserUser: string | null = null;
  let slot: string | null = null;
  let locked = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const controller = new AbortController();
  active.set(taskId, controller);
  try {
    for (let i = 0; i < limits.concurrency; i++) {
      const candidate = "afg-agent-slot:" + i;
      if (
        (
          await db.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [
            candidate,
          ])
        ).rows[0].ok
      ) {
        slot = candidate;
        break;
      }
    }
    if (!slot) return;
    locked = (
      await db.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [key])
    ).rows[0].ok;
    if (!locked) return;
    let task = (
      await db.query("SELECT * FROM agent_tasks WHERE id=$1", [taskId])
    ).rows[0];
    if (!task || task.status !== "ready") return;
    const claim = await db.query(
      "UPDATE agent_tasks SET status='running',updated_at=now() WHERE id=$1 AND status='ready' RETURNING *",
      [taskId],
    );
    if (!claim.rowCount) return;
    task = claim.rows[0];
    heartbeat = setInterval(() => {
      void pool!
        .query("SELECT status FROM agent_tasks WHERE id=$1", [taskId])
        .then((r) => {
          if (r.rows[0]?.status !== "running") controller.abort();
        })
        .catch(() => controller.abort());
    }, 500);
    await event(db, taskId, "started");
    if (!task.plan) {
      await db.query(
        "UPDATE agent_tasks SET planning_attempts=planning_attempts+1 WHERE id=$1",
        [taskId],
      );
      const available = await availableTools(task.user_id);
      const schemas = Object.fromEntries(
        available.map((name) => [
          name,
          {
            input: inputs[name].toJSONSchema(),
            approval: requiresApproval(name),
          },
        ]),
      );
      const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
      let generated;
      try {
        generated = await infer(
          task.user_id,
          task.model,
          `Plan this objective: ${task.objective}\n${(await buildPersonalContextMessage(task.user_id, task.objective)) || ""}\nReturn JSON only: {"steps":[{"agent":"planning|research|coding|browser|file|personal","tool":"name","input":{},"dependsOn":[]}]} with at most 8 steps, earlier dependency indices, and a final draft step synthesizing prior results. Specialist assignments: planning=draft,memory_search; research=web_search,browser_open,browser_snapshot,draft,memory_search; coding=github tools,draft; browser=browser tools,draft; file=knowledge_read,draft; personal=memory_search,task_create,draft. Available tools: ${JSON.stringify(schemas)}. Never invent IDs, URLs or page element refs. Do not save memory automatically. If required capabilities are missing, produce a draft explaining the missing capability.`,
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }
      const plan = validatePlan(
        JSON.parse(generated.text.replace(/^```(?:json)?\s*|\s*```$/g, "")),
        available,
      );
      if (plan.steps.at(-1)?.tool !== "draft")
        throw new Error("Plan must finish with a consolidated draft.");
      controller.signal.throwIfAborted();
      await db.query("BEGIN");
      try {
        const state = await db.query(
          "SELECT status FROM agent_tasks WHERE id=$1 FOR UPDATE",
          [taskId],
        );
        if (state.rows[0]?.status !== "running")
          throw new Error("Task stopped.");
        await checkpointPlan(db, taskId, plan);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
      // The user reviews the immutable generated plan before execution.
      await db.query(
        "UPDATE agent_tasks SET status='draft' WHERE id=$1 AND status='ready'",
        [taskId],
      );
      return;
    }
    const steps = (
      await db.query(
        "SELECT * FROM agent_steps WHERE task_id=$1 ORDER BY position",
        [taskId],
      )
    ).rows;
    for (const step of steps) {
      controller.signal.throwIfAborted();
      if (step.status === "completed") continue;
      if (step.status === "running")
        throw new Error("Interrupted execution requires explicit recovery.");
      const tool = step.tool as Tool;
      if (tool.startsWith("browser_")) browserUser = task.user_id;
      validatePlan(task.plan, Object.keys(inputs) as Tool[]);
      if (requiresApproval(tool) && !step.approved_at) {
        await db.query(
          "UPDATE agent_steps SET status='waiting_for_approval' WHERE id=$1",
          [step.id],
        );
        await db.query(
          "UPDATE agent_tasks SET status='waiting_for_approval',updated_at=now() WHERE id=$1 AND status='running'",
          [taskId],
        );
        await event(db, taskId, "approval_required", step.id);
        return;
      }
      const start = Date.now();
      await db.query("BEGIN");
      try {
        const current = await db.query(
          "SELECT status FROM agent_tasks WHERE id=$1 FOR UPDATE",
          [taskId],
        );
        if (current.rows[0]?.status !== "running")
          throw new Error("Task stopped.");
        await db.query(
          "UPDATE agent_steps SET status='running',attempts=attempts+1,started_at=now(),error=NULL WHERE id=$1",
          [step.id],
        );
        await event(db, taskId, "step_started", step.id);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
      const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
      try {
        const previous = steps
          .filter((s) => s.position < step.position && s.status === "completed")
          .map((s) => ({ tool: s.tool, output: s.output }));
        const output = await executeTool(
          task.user_id,
          task.model,
          tool,
          step.input,
          previous,
          controller.signal,
          !!step.approved_at,
        );
        controller.signal.throwIfAborted();
        if (Buffer.byteLength(JSON.stringify(output)) > 100000)
          throw new Error("Tool output exceeded storage limit.");
        await db.query("BEGIN");
        try {
          const state = await db.query(
            "SELECT status FROM agent_tasks WHERE id=$1 FOR UPDATE",
            [taskId],
          );
          if (state.rows[0]?.status !== "running")
            throw new Error("Task stopped.");
          if (tool === "task_create") {
            await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
              task.user_id,
            ]);
            const count = await db.query(
              "SELECT count(*)::int AS n,coalesce(sum(octet_length(content)),0)::bigint AS bytes FROM productivity_items WHERE user_id=$1",
              [task.user_id],
            );
            if (
              count.rows[0].n >= 500 ||
              Number(count.rows[0].bytes) +
                Buffer.byteLength(step.input.content) >
                5 * 1024 * 1024
            )
              throw new Error("Task storage limit reached.");
            await db.query(
              "INSERT INTO productivity_items(user_id,tool_type,title,content) VALUES($1,'task',$2,$3)",
              [task.user_id, step.input.title, step.input.content],
            );
          }
          await db.query(
            "UPDATE agent_steps SET status='completed',output=$2,finished_at=now() WHERE id=$1",
            [step.id, JSON.stringify(output)],
          );
          await event(db, taskId, "step_completed", step.id);
          await db.query("COMMIT");
        } catch (e) {
          await db.query("ROLLBACK");
          throw e;
        }
        step.status = "completed";
        step.output = output;
        console.info(
          "AFG_AGENT_DURATION",
          JSON.stringify({
            taskId,
            stepId: step.id,
            tool,
            durationMs: Date.now() - start,
            attempt: step.attempts + 1,
          }),
        );
      } catch (e) {
        await db.query(
          "UPDATE agent_steps SET status='failed',error='Execution failed or was interrupted. Inspect before retry.',finished_at=now() WHERE id=$1 AND status='running'",
          [step.id],
        );
        await event(db, taskId, "step_failed", step.id);
        throw e;
      } finally {
        clearTimeout(timer);
      }
    }
    const completed = await db.query(
      "UPDATE agent_tasks SET status='completed',updated_at=now(),error=NULL WHERE id=$1 AND status='running'",
      [taskId],
    );
    if (completed.rowCount) await event(db, taskId, "completed");
  } catch {
    const failed = await db
      .query(
        "UPDATE agent_tasks SET status='failed',error='Execution failed. Check provider/tool configuration or inspect the interrupted step before retrying.',updated_at=now() WHERE id=$1 AND status='running'",
        [taskId],
      )
      .catch(() => null);
    if (failed?.rowCount) await event(db, taskId, "failed").catch(() => {});
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (browserUser) {
      const final = await db
        .query("SELECT status FROM agent_tasks WHERE id=$1", [taskId])
        .catch(() => ({ rows: [] }));
      if (["completed", "failed", "cancelled"].includes(final.rows[0]?.status))
        await executeBrowserAutomationTool(
          browserUser,
          "browser_stop",
          {},
        ).catch(() =>
          console.warn(
            "AFG_AGENT_BROWSER_CLEANUP_FAILED",
            JSON.stringify({ taskId }),
          ),
        );
    }
    // Remote sessions belong to the task's user; no browser cookies enter execution logs.
    if (locked) {
      await db
        .query("SELECT pg_advisory_unlock(hashtext($1))", [key])
        .catch(() => {});
    }
    if (slot)
      await db
        .query("SELECT pg_advisory_unlock(hashtext($1))", [slot])
        .catch(() => {});
    active.delete(taskId);
    db.release();
  }
}
export function cancelLocal(taskId: string) {
  active.get(taskId)?.abort();
}
export function kick() {
  if (runtime.draining || !pool) return;
  runtime.draining = true;
  void (async () => {
    try {
      for (let batch = 0; batch < limits.queued; batch++) {
        const rows = await pool!.query(
          "SELECT id FROM agent_tasks WHERE status='ready' ORDER BY created_at LIMIT $1",
          [limits.concurrency],
        );
        if (!rows.rowCount) break;
        await Promise.all(rows.rows.map((r) => run(r.id)));
      }
    } catch {
      console.warn("AFG_AGENT_QUEUE_UNAVAILABLE");
    } finally {
      runtime.draining = false;
      if (!(pool as any)?.ending) {
        clearTimeout(runtime.timer);
        runtime.timer = setTimeout(kick, 2000);
        runtime.timer.unref();
      }
    }
  })();
}
