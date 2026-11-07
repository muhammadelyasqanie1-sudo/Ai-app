import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let workerRunning = false;

export function startProgrammingKnowledgeScheduler() {
  if (process.env.AFG_KNOWLEDGE_WORKER_ENABLED !== 'true') return;

  const intervalMinutes = Math.max(30, Math.min(1440, Number(process.env.AFG_KNOWLEDGE_WORKER_INTERVAL_MINUTES || 60)));
  const startupDelayMs = Math.max(30_000, Math.min(600_000, Number(process.env.AFG_KNOWLEDGE_WORKER_STARTUP_DELAY_MS || 90_000)));

  const run = () => {
    if (workerRunning) {
      console.info('AFG_KNOWLEDGE_WORKER_SKIPPED', JSON.stringify({ reason: 'previous_run_still_active' }));
      return;
    }
    workerRunning = true;
    const script = path.join(projectRoot, 'scripts', 'programming-knowledge-worker.ts');
    console.info('AFG_KNOWLEDGE_WORKER_STARTING', JSON.stringify({ intervalMinutes }));
    const child = spawn(process.execPath, ['--import', 'tsx', script], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', (error) => {
      workerRunning = false;
      console.error('AFG_KNOWLEDGE_WORKER_SPAWN_FAILED', error.message.slice(0, 240));
    });
    child.once('close', (code, signal) => {
      workerRunning = false;
      console.info('AFG_KNOWLEDGE_WORKER_FINISHED', JSON.stringify({ exitCode: code, signal }));
    });
  };

  const startupTimer = setTimeout(run, startupDelayMs);
  startupTimer.unref();
  const intervalTimer = setInterval(run, intervalMinutes * 60_000);
  intervalTimer.unref();
  console.info('AFG_KNOWLEDGE_SCHEDULER_ENABLED', JSON.stringify({ intervalMinutes, startupDelayMs }));
}
