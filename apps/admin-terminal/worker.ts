import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/api/database.ts';
import { prepareVerifiedChat } from '../../src/services/chatService.ts';
import { ProviderAdapterError } from '../../src/providers/providerTypes.ts';

const workerId = process.env.AFG_TERMINAL_WORKER_ID?.trim() || randomUUID();
const pollMs = Math.max(500, Math.min(10_000, Number(process.env.AFG_TERMINAL_WORKER_POLL_MS || 1500)));
const maxRunMs = Math.max(15_000, Math.min(180_000, Number(process.env.AFG_TERMINAL_WORKER_TIMEOUT_MS || 120_000)));
const maxOutputChars = 120_000;
let stopping = false;

type GatewayJob = {
  id: string;
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  no_fallback: boolean;
  attempt_count: number;
};

async function heartbeat(stopped = false) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO admin_terminal_gateway_workers(worker_id,hostname,version,started_at,last_seen_at,stopped_at)
     VALUES($1,$2,'1',now(),now(),CASE WHEN $3 THEN now() ELSE NULL END)
     ON CONFLICT(worker_id) DO UPDATE SET hostname=EXCLUDED.hostname,last_seen_at=now(),
       stopped_at=CASE WHEN $3 THEN now() ELSE NULL END`,
    [workerId, hostname().slice(0, 120), stopped],
  );
}

async function claimJob(): Promise<GatewayJob | null> {
  if (!pool) return null;
  const result = await pool.query(
    `WITH candidate AS (
       SELECT id FROM admin_terminal_gateway_jobs
        WHERE status='queued' AND expires_at>now() AND attempt_count<3
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE admin_terminal_gateway_jobs j
        SET status='running',started_at=now(),attempt_count=j.attempt_count+1
       FROM candidate c WHERE j.id=c.id
     RETURNING j.id,j.model,j.messages,j.no_fallback,j.attempt_count`,
  );
  return (result.rows[0] as GatewayJob | undefined) || null;
}

function safeErrorCode(error: unknown): string {
  const raw = error instanceof ProviderAdapterError ? error.code : 'worker_error';
  return String(raw).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || 'worker_error';
}

async function processJob(job: GatewayJob) {
  if (!pool) return;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, maxRunMs);
  let output = '';
  let providerId = '';
  let modelId = '';
  try {
    const prepared = await prepareVerifiedChat({
      model: job.model,
      messages: job.messages,
      noFallback: job.no_fallback,
      signal: controller.signal,
      onModelSelected: (provider, model) => { providerId = provider; modelId = model; },
    });
    for await (const chunk of prepared.stream) {
      if (controller.signal.aborted) throw new Error(timedOut ? 'worker_timeout' : 'worker_cancelled');
      if (chunk.content) {
        output += chunk.content;
        if (output.length > maxOutputChars) {
          controller.abort();
          throw new Error('output_limit_exceeded');
        }
      }
    }
    await pool.query(
      `UPDATE admin_terminal_gateway_jobs
          SET status='completed',output_text=$2,provider_id=$3,model_id=$4,completed_at=now(),error_code=NULL
        WHERE id=$1 AND status='running'`,
      [job.id, output, providerId || prepared.providerId, modelId || prepared.modelId],
    );
  } catch (error) {
    const code = timedOut ? 'worker_timeout' : safeErrorCode(error);
    const retryable = error instanceof ProviderAdapterError &&
      (error.status === 429 || error.status >= 500) && job.attempt_count < 3;
    await pool.query(
      `UPDATE admin_terminal_gateway_jobs
          SET status=CASE WHEN $2::boolean THEN 'queued' ELSE 'failed' END,
              error_code=$3,completed_at=CASE WHEN $2::boolean THEN NULL ELSE now() END
        WHERE id=$1 AND status='running'`,
      [job.id, retryable, code],
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!pool) throw new Error('DATABASE_URL is required for the AFG AI terminal worker.');
  console.info('AFG_TERMINAL_WORKER_STARTING', JSON.stringify({ workerId }));
  await heartbeat();
  while (!stopping) {
    try {
      await heartbeat();
      const job = await claimJob();
      if (job) {
        await processJob(job);
        continue;
      }
    } catch {
      console.error('AFG_TERMINAL_WORKER_LOOP_ERROR');
    }
    await pause(pollMs);
  }
  await heartbeat(true).catch(() => {});
  await pool.end().catch(() => {});
  console.info('AFG_TERMINAL_WORKER_STOPPED', JSON.stringify({ workerId }));
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

main().catch((error) => {
  console.error('AFG_TERMINAL_WORKER_FATAL', error instanceof Error ? error.message.slice(0, 180) : 'unknown_error');
  process.exitCode = 1;
});
