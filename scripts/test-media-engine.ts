import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  unlink,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pool } from "../src/api/database.ts";
import { handleMediaApi } from "../src/api/media.ts";
import { handleFilesApi } from "../src/api/files.ts";
import { handleAgentsApi } from "../src/api/agents.ts";
import {
  executeMediaJob,
  configuredMediaTasks,
  mediaConfiguration,
} from "../src/services/media/engine.ts";
import {
  availableTools,
  executeTool,
} from "../src/services/agents/registry.ts";
import {
  boundedResponse,
  compatibleMedia,
} from "../src/providers/compatibleMedia.ts";
import { saveOutput } from "../src/services/media/storage.ts";
import { mediaRequest } from "../src/services/media/contracts.ts";
const dbUrl = new URL(process.env.DATABASE_URL || "");
assert.equal(dbUrl.hostname, "127.0.0.1");
assert.equal(dbUrl.port, "55432");
assert.equal(dbUrl.pathname, "/afg_agent_test");
const root = await mkdtemp(path.join(tmpdir(), "afg-media-test-"));
process.env.AFG_UPLOAD_QUARANTINE_DIR = path.join(root, "private");
process.env.AFG_CLAMSCAN_PATH = "/usr/bin/clamscan";
process.env.AFG_CLAMSCAN_DATABASE = path.join(root, "test.ndb");
// Real ClamAV with a synthetic signature DB: verifies integration, not production malware coverage.
await writeFile(
  process.env.AFG_CLAMSCAN_DATABASE,
  "AFG.Test.Signature:0:*:" +
    Buffer.from("AFG_TEST_REJECT_ME").toString("hex") +
    "\n",
);
const users: string[] = [],
  tokens: string[] = [];
const csrf = randomBytes(24).toString("hex");
const server = createServer((req, res) => {
  const p = new URL(req.url!, "http://local").pathname;
  void (
    p.startsWith("/api/media")
      ? handleMediaApi(req, res, p)
      : p.startsWith("/api/files")
        ? handleFilesApi(req, res, p)
        : handleAgentsApi(req, res, p)
  ).catch(() => {
    res.statusCode = 500;
    res.end();
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
async function call(
  p: string,
  user = 0,
  method = "GET",
  body?: unknown,
  secure = true,
) {
  return fetch(`http://127.0.0.1:${(server.address() as any).port}/api/${p}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `afg_session=${tokens[user] || ""}; afg_csrf=${csrf}`,
      ...(secure ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function upload(name: string, bytes: Buffer) {
  const r = await call("files", 0, "POST", {
    name,
    dataBase64: bytes.toString("base64"),
  });
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()).file;
}
async function scan(id: string, status = "approved") {
  const r = await call("files/" + id + "/scan", 0, "POST", {});
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).file.status, status);
}
async function create(input: Record<string, unknown>) {
  const body = {
    type: "document_extract",
    inputFileIds: [],
    requestKey: randomUUID(),
    ...input,
  };
  const r = await call("media/jobs", 0, "POST", body);
  assert.equal(r.status, 201, await r.clone().text());
  return { body, job: (await r.json()).job };
}
async function wait(id: string, status: string) {
  for (let i = 0; i < 150; i++) {
    const jobs = (await (await call("media/jobs")).json()).jobs;
    const j = jobs.find((j: any) => j.id === id);
    if (j?.status === status) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Job did not reach " + status);
}
try {
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    users.push(id);
    tokens.push(token);
    await pool!.query(
      "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Media verification')",
      [id, id + "@example.invalid"],
    );
    await pool!.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [id, createHash("sha256").update(token).digest("hex")],
    );
  }
  assert.equal((await call("media/jobs", 8)).status, 401);
  assert.equal((await call("files", 8)).status, 401);
  assert.equal((await call("media/jobs", 0, "POST", {}, false)).status, 403);
  assert.equal(
    (
      await call("files", 0, "POST", {
        name: "evil.png",
        dataBase64: Buffer.from("not an image").toString("base64"),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("files", 0, "POST", {
        name: "../evil.txt",
        dataBase64: "dGVzdA==",
      })
    ).status,
    400,
  );
  const file = await upload(
    "approved-source.md",
    Buffer.from("# Source\nA real local extraction fixture.\n"),
  );
  assert.equal((await call("files/" + file.id + "/download")).status, 409);
  assert.equal(
    (
      await call("media/jobs", 0, "POST", {
        type: "document_extract",
        requestKey: randomUUID(),
        inputFileIds: [file.id],
      })
    ).status,
    400,
  );
  for (const suffix of ["download", "scan"])
    assert.equal(
      (
        await call(
          "files/" + file.id + "/" + suffix,
          1,
          suffix === "scan" ? "POST" : "GET",
          suffix === "scan" ? {} : undefined,
        )
      ).status,
      404,
    );
  assert.equal((await call("files/" + file.id, 1, "DELETE", {})).status, 404);
  const scanner = process.env.AFG_CLAMSCAN_PATH;
  delete process.env.AFG_CLAMSCAN_PATH;
  assert.equal(
    (await call("files/" + file.id + "/scan", 0, "POST", {})).status,
    503,
  );
  process.env.AFG_CLAMSCAN_PATH = scanner;
  await scan(file.id);
  assert.match(
    await (await call("files/" + file.id + "/download")).text(),
    /real local extraction/,
  );
  const infected = await upload(
    "rejected.txt",
    Buffer.from("AFG_TEST_REJECT_ME"),
  );
  await scan(infected.id, "rejected");
  assert.equal((await call("files/" + infected.id + "/download")).status, 409);
  const { body, job } = await create({ inputFileIds: [file.id] });
  const completed = await wait(job.id, "completed");
  assert.match(completed.result.text, /A real local extraction fixture/);
  assert.equal(completed.usage, null);
  const again = await call("media/jobs", 0, "POST", body);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).job.id, job.id);
  assert.equal(
    (await call("media/jobs", 0, "POST", { ...body, prompt: "changed" }))
      .status,
    409,
  );
  assert.equal((await call("media/jobs", 1)).status, 200);
  assert.equal((await (await call("media/jobs", 1)).json()).jobs.length, 0);
  assert.equal((await call("agents/tasks/" + job.task_id, 1)).status, 404);
  // Storage protocol fixture: actual private disk and DB output path, not an inferred/generated image.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  const outputDb = await pool!.connect();
  let output: any;
  try {
    await outputDb.query("BEGIN");
    output = await saveOutput(outputDb, users[0], job.id, png, "image/png");
    await outputDb.query("COMMIT");
  } catch (e) {
    await outputDb.query("ROLLBACK");
    throw e;
  } finally {
    outputDb.release();
  }
  assert.equal((await call("files/" + output.id + "/download")).status, 409);
  assert.equal((await call("files/" + output.id + "/download", 1)).status, 404);
  await scan(output.id);
  assert.deepEqual(
    Buffer.from(
      await (await call("files/" + output.id + "/download")).arrayBuffer(),
    ),
    png,
  );
  const quotaIds: string[] = [];
  try {
    for (let i = 0; i < 100; i++) {
      const id = randomUUID();
      quotaIds.push(id);
      await pool!.query(
        "INSERT INTO files(id,user_id,kind,mime,size_bytes,storage_key) VALUES($1,$2,'txt','text/plain',1,'quota-fixture')",
        [id, users[0]],
      );
    }
    assert.equal(
      (
        await call("files", 0, "POST", {
          name: "blocked.txt",
          dataBase64: "dGVzdA==",
        })
      ).status,
      413,
    );
  } finally {
    await pool!.query("DELETE FROM files WHERE id=ANY($1::uuid[])", [quotaIds]);
  }
  const byteQuotaId=randomUUID();
  try {
    await pool!.query("INSERT INTO files(id,user_id,kind,mime,size_bytes,storage_key) VALUES($1,$2,'txt','text/plain',$3,'quota-fixture')",[byteQuotaId,users[0],100*1024*1024]);
    assert.equal((await call('files',0,'POST',{name:'full.txt',dataBase64:'dGVzdA=='})).status,413);
    const quotaDb=await pool!.connect();try{await quotaDb.query('BEGIN');await assert.rejects(saveOutput(quotaDb,users[0],job.id,png,'image/png'));}finally{await quotaDb.query('ROLLBACK');quotaDb.release();}
  } finally {await pool!.query('DELETE FROM files WHERE id=$1',[byteQuotaId]);}
  const checkpoint = await executeMediaJob(
    users[0],
    job.id,
    job.task_id,
    new AbortController().signal,
  );
  assert.equal(checkpoint.text, completed.result.text);
  await assert.rejects(
    executeMediaJob(
      users[1],
      job.id,
      job.task_id,
      new AbortController().signal,
    ),
  );
  assert.equal(
    (await availableTools(users[0])).includes("media_execute"),
    false,
  );
  await assert.rejects(
    executeTool(
      users[0],
      "auto",
      "media_execute",
      { jobId: job.id },
      [],
      new AbortController().signal,
    ),
  );
  assert.equal(
    (
      await call("media/jobs", 0, "POST", {
        type: "image_generate",
        prompt: "test",
        provider: "missing",
        model: "unconfigured",
        requestKey: randomUUID(),
      })
    ).status,
    400,
  );
  const pdf = await upload(
    "source.pdf",
    Buffer.from("%PDF-1.0\nsynthetic format fixture"),
  );
  await scan(pdf.id);
  assert.equal(
    (
      await call("media/jobs", 0, "POST", {
        type: "document_extract",
        inputFileIds: [pdf.id],
        requestKey: randomUUID(),
      })
    ).status,
    400,
  );
  const invalidText = await upload(
    "invalid-utf8.txt",
    Buffer.from([0xff, 0xfe, 0xfd]),
  );
  await scan(invalidText.id);
  const invalidJob = await create({ inputFileIds: [invalidText.id] });
  const failedJob = await wait(invalidJob.job.id, "failed");
  assert.equal(failedJob.result.error.code, "media_execution_failed");
  assert.equal(failedJob.result.text, undefined);
  // Actual local media parser, restricted to pipe protocol; this is a synthetic container fixture, not AI media.
  const videoPath = path.join(root, "fixture.mp4");
  const encoded = spawnSync("/usr/bin/ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=32x32:d=0.1",
    "-c:v",
    "libx264",
    "-movflags",
    "frag_keyframe+empty_moov",
    videoPath,
  ]);
  assert.equal(encoded.status, 0);
  const video = await upload("fixture.mp4", await readFile(videoPath));
  await scan(video.id);
  const clip = await create({
    type: "video_analyze",
    inputFileIds: [video.id],
  });
  const analyzed = await wait(clip.job.id, "completed");
  assert.equal(JSON.parse(analyzed.result.text).streams[0].width, 32);
  // Prevent dispatch long enough to deterministically exercise cancellation of an admitted job.
  const locks = await pool!.connect();
  try {
    for (let i = 0; i < 2; i++)
      await locks.query("SELECT pg_advisory_lock(hashtext($1))", [
        "afg-agent-slot:" + i,
      ]);
    const cancelled = await create({ inputFileIds: [file.id] });
    assert.equal(
      (
        await call(
          "agents/tasks/" + cancelled.job.task_id + "/cancel",
          0,
          "POST",
          {},
        )
      ).status,
      200,
    );
    const stopped = await wait(cancelled.job.id, "cancelled");
    assert.equal(stopped.result, null);
  } finally {
    await locks.query("SELECT pg_advisory_unlock_all()");
    locks.release();
  }
  const row = (await pool!.query("SELECT * FROM files WHERE id=$1", [file.id]))
    .rows[0];
  await writeFile(row.storage_key, "changed");
  assert.equal((await call("files/" + file.id + "/download")).status, 409);
  await unlink(row.storage_key);
  await symlink(videoPath, row.storage_key);
  assert.equal((await call("files/" + file.id + "/download")).status, 409);
  assert.equal((await call("files/" + file.id, 0, "DELETE", {})).status, 200);
  assert.equal((await call("files/" + file.id + "/download")).status, 404);
  assert.match(
    (
      await executeMediaJob(
        users[0],
        job.id,
        job.task_id,
        new AbortController().signal,
      )
    ).text,
    /real local extraction/,
  );
  assert.equal(
    (await call("media/jobs/" + job.id, 1, "DELETE", {})).status,
    404,
  );
  assert.equal(
    (await call("media/jobs/" + job.id, 0, "DELETE", {}, false)).status,
    403,
  );
  assert.equal(
    (await call("media/jobs/" + job.id, 0, "DELETE", {})).status,
    200,
  );
  assert.equal(
    (
      await pool!.query(
        "SELECT count(*)::int AS n FROM media_jobs WHERE id=$1",
        [job.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await pool!.query("SELECT media_job_id FROM files WHERE id=$1", [
        output.id,
      ])
    ).rows[0].media_job_id,
    null,
  );
  const audit = await pool!.query(
    "SELECT action FROM audit_logs WHERE actor_user_id=$1 AND action IN ('media.file.scanned','media.file.deleted','media.history.deleted')",
    [users[0]],
  );
  assert(audit.rows.length >= 3);
  // Pure protocol failure checks do not simulate successful provider inference.
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    compatibleMedia(
      { baseUrl: "http://127.0.0.1:1", apiKey: "synthetic" },
      mediaRequest.parse({
        type: "image_generate",
        model: "protocol-only",
        prompt: "test",
        requestKey: randomUUID(),
      }),
      [],
      controller.signal,
    ),
  );
  await assert.rejects(boundedResponse(new Response(new Uint8Array(12)), 10));
  process.env.AFG_MEDIA_TASKS_JSON = JSON.stringify({
    "x::y": ["speech_generate", "invented"],
  });
  assert.deepEqual(configuredMediaTasks("x", "y"), []);
  assert.deepEqual(configuredMediaTasks("other", "y"), []);
  assert.equal(mediaConfiguration().valid, false);
  process.env.AFG_MEDIA_TASKS_JSON = JSON.stringify({
    "x::y": ["speech_generate"],
  });
  assert.deepEqual(configuredMediaTasks("x", "y"), ["speech_generate"]);
  delete process.env.AFG_MEDIA_TASKS_JSON;
  console.log(
    "PASS media HTTP/SQL ownership, real ClamAV fixture scan/rejection, quarantine, extraction, metadata, idempotency, checkpoints, cancellation, tamper/symlink rejection and bounded provider failures. Live inference not tested.",
  );
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  for (const user of users) {
    await pool!.query("DELETE FROM agent_tasks WHERE user_id=$1", [user]);
    await pool!.query("DELETE FROM files WHERE user_id=$1", [user]);
    await pool!.query("DELETE FROM sessions WHERE user_id=$1", [user]);
    await pool!.query(
      "UPDATE users SET deleted_at=now(),email=$2 WHERE id=$1",
      [user, user + "@deleted.invalid"],
    );
  }
  await rm(root, { recursive: true, force: true });
  await pool!.end();
}
