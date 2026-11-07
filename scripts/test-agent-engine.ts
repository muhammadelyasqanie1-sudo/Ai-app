import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { pool } from "../src/api/database.ts";
import { handleAgentsApi } from "../src/api/agents.ts";
import { handleAccountApi } from "../src/api/account.ts";
import {
  validatePlan,
  requiresApproval,
  referenceResults,
} from "../src/services/agents/registry.ts";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55432");
assert.equal(url.pathname, "/afg_agent_test");
const ids: string[] = [],
  tokens: string[] = [];
const csrf = randomBytes(24).toString("hex");
const server = createServer((req, res) => {
  const p = new URL(req.url!, "http://local").pathname;
  void (
    p.startsWith("/api/account")
      ? handleAccountApi(req, res, p)
      : handleAgentsApi(req, res, p)
  ).catch(() => {
    res.statusCode = 500;
    res.end();
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as any).port;
async function call(
  path: string,
  user = 0,
  method = "GET",
  body?: unknown,
  secure = true,
) {
  return fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `afg_session=${tokens[user] || ""}; afg_csrf=${csrf}`,
      ...(secure ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const plan = (steps: any[]) => ({
  steps: steps.map((s) => ({ dependsOn: [], ...s })),
});
const memory = {
  agent: "personal",
  tool: "memory_search",
  input: { query: "project" },
};
async function create(p: unknown, objective = "Agent regression task") {
  const body = { requestKey: randomUUID(), objective, model: "auto", plan: p };
  const res = await call("agents/tasks", 0, "POST", body);
  assert.equal(res.status, 201);
  return { body, task: (await res.json()).task };
}
async function wait(id: string, state: string) {
  for (let n = 0; n < 100; n++) {
    const d = await (await call("agents/tasks/" + id)).json();
    if (d.task.status === state) return d;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Task did not reach " + state);
}
try {
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    ids.push(id);
    tokens.push(token);
    await pool!.query(
      "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Agent test')",
      [id, id + "@example.invalid"],
    );
    await pool!.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [id, createHash("sha256").update(token).digest("hex")],
    );
  }
  assert.throws(() =>
    validatePlan(plan([{ ...memory, dependsOn: [0] }]), ["memory_search"]),
  );
  assert.throws(() =>
    validatePlan(plan([{ ...memory, agent: "coding" }]), ["memory_search"]),
  );
  assert.throws(() =>
    validatePlan(plan([{ ...memory, input: { query: "ok", command: "rm" } }]), [
      "memory_search",
    ]),
  );
  assert.equal(requiresApproval("browser_press"), true);
  assert.equal(
    referenceResults([
      {
        output: {
          text: "source",
          liveViewUrl: "private-session",
          sessionId: "secret",
          nested: { cookies: "secret" },
        },
      },
    ]),
    '[{"output":{"text":"source","nested":{}}}]',
  );
  assert.equal((await call("agents/tasks", 8)).status, 401);
  assert.equal((await call("agents/tasks", 0, "POST", {}, false)).status, 403);
  const saved = await call("account/memories", 0, "POST", {
    category: "facts",
    content: "Approved project context for engine regression.",
    consentSensitive: false,
  });
  assert.equal(saved.status, 201);
  const mid = (await saved.json()).memory.id;
  assert.equal(
    (
      await call("account/memories/" + mid, 1, "PATCH", {
        category: "facts",
        content: "stolen",
        consentSensitive: false,
      })
    ).status,
    404,
  );
  const chain = await create(
    plan([
      memory,
      {
        agent: "personal",
        tool: "task_create",
        input: {
          title: "Agent integration output",
          content: "Created after explicit approval",
        },
        dependsOn: [0],
      },
      memory,
    ]),
  );
  assert.equal((await call("agents/tasks", 0, "POST", chain.body)).status, 200);
  assert.equal(
    (
      await call("agents/tasks", 0, "POST", {
        ...chain.body,
        objective: "Different",
      })
    ).status,
    409,
  );
  assert.equal((await call("agents/tasks/" + chain.task.id, 1)).status, 404);
  assert.equal(
    (await call("agents/tasks/" + chain.task.id + "/start", 1, "POST", {}))
      .status,
    404,
  );
  await call("agents/tasks/" + chain.task.id + "/start", 0, "POST", {});
  const waiting = await wait(chain.task.id, "waiting_for_approval");
  assert.equal(waiting.steps[0].status, "completed");
  assert.match(JSON.stringify(waiting.steps[0].output), /Approved project/);
  assert.equal(
    (
      await pool!.query("SELECT id FROM productivity_items WHERE user_id=$1", [
        ids[0],
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await call("agents/tasks/" + chain.task.id + "/approve", 1, "POST", {
        stepId: waiting.steps[1].id,
        approved: true,
      })
    ).status,
    404,
  );
  await call("agents/tasks/" + chain.task.id + "/approve", 0, "POST", {
    stepId: waiting.steps[1].id,
    approved: true,
  });
  const done = await wait(chain.task.id, "completed");
  assert.equal(done.steps.length, 3);
  assert.ok(done.steps.every((s: any) => s.status === "completed"));
  assert.equal(done.steps[0].attempts, 1);
  assert.equal(
    (
      await pool!.query("SELECT id FROM productivity_items WHERE user_id=$1", [
        ids[0],
      ])
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await pool!.query(
        "SELECT id FROM audit_logs WHERE actor_user_id=$1 AND action='agent.step.approved'",
        [ids[0]],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await call("agents/tasks/" + chain.task.id + "/approve", 0, "POST", {
        stepId: waiting.steps[1].id,
        approved: true,
      })
    ).status,
    409,
  );
  // Failed read can be retried, preserving the completed checkpoint.
  const retry = await create(
    plan([
      memory,
      {
        agent: "file",
        tool: "knowledge_read",
        input: { id: randomUUID() },
        dependsOn: [0],
      },
    ]),
  );
  await call("agents/tasks/" + retry.task.id + "/start", 0, "POST", {});
  await wait(retry.task.id, "failed");
  await call("agents/tasks/" + retry.task.id + "/resume", 0, "POST", {});
  const retried = await wait(retry.task.id, "failed");
  assert.equal(retried.steps[0].attempts, 1);
  assert.equal(retried.steps[1].attempts, 2);
  // Simulate process loss after claim: explicit resume must reacquire approval.
  await pool!.query("UPDATE agent_tasks SET status='running' WHERE id=$1", [
    retry.task.id,
  ]);
  await pool!.query(
    "UPDATE agent_steps SET tool='task_create',agent='personal',input=$2,status='running' WHERE id=$1",
    [
      retried.steps[1].id,
      JSON.stringify({
        title: "Recovered output",
        content: "No duplicate automatic execution",
      }),
    ],
  );
  // Keep immutable plan consistent with stored step for this recovery fixture.
  await pool!.query("UPDATE agent_tasks SET plan=$2 WHERE id=$1", [
    retry.task.id,
    JSON.stringify(
      plan([
        memory,
        {
          agent: "personal",
          tool: "task_create",
          input: {
            title: "Recovered output",
            content: "No duplicate automatic execution",
          },
          dependsOn: [0],
        },
      ]),
    ),
  ]);
  await call("agents/tasks/" + retry.task.id + "/resume", 0, "POST", {});
  const recovered = await wait(retry.task.id, "waiting_for_approval");
  assert.equal(recovered.steps[1].approved_at, null);
  await call("agents/tasks/" + retry.task.id + "/cancel", 0, "POST", {});
  await wait(retry.task.id, "cancelled");
  // Hold a real memory table read; cancel the running task before releasing it.
  const blocker = await pool!.connect();
  await blocker.query("BEGIN");
  await blocker.query("LOCK user_memories IN ACCESS EXCLUSIVE MODE");
  const cancelling = await create(plan([memory]));
  await call("agents/tasks/" + cancelling.task.id + "/start", 0, "POST", {});
  await wait(cancelling.task.id, "running");
  await call("agents/tasks/" + cancelling.task.id + "/cancel", 0, "POST", {});
  await blocker.query("ROLLBACK");
  blocker.release();
  await new Promise((r) => setTimeout(r, 300));
  const cancelled = await wait(cancelling.task.id, "cancelled");
  assert.equal(cancelled.steps[0].status, "cancelled");
  assert.equal(cancelled.steps[0].output, null);
  await call("account/memories/" + mid, 0, "PATCH", {
    category: "facts",
    content: "Corrected approved context",
    consentSensitive: false,
  });
  assert.match(
    JSON.stringify(await (await call("account/memories")).json()),
    /Corrected approved/,
  );
  assert.equal(
    (await call("account/memories/" + mid, 1, "DELETE")).status,
    404,
  );
  assert.equal(
    (await call("account/memories/" + mid, 0, "DELETE")).status,
    200,
  );
  console.log(
    "Agent lifecycle, multi-step checkpointing, approval, replay protection, retry, interruption recovery, cancellation, CSRF, memory CRUD and user isolation passed.",
  );
} finally {
  await new Promise((r) => setTimeout(r, 600));
  await pool!.query("DELETE FROM agent_tasks WHERE user_id=ANY($1::uuid[])", [
    ids,
  ]);
  await pool!.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    ids,
  ]);
  await pool!.query(
    "UPDATE users SET status='deleted' WHERE id=ANY($1::uuid[])",
    [ids],
  );
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await pool!.end();
}
