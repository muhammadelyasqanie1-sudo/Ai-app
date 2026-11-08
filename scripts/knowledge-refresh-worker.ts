import 'dotenv/config';
import { pool } from '../src/api/database.ts';
import { refreshKnowledgeDocument } from '../src/services/knowledgeBase.ts';

/**
 * Bounded freshness worker for user-owned knowledge with a public source URL.
 *
 * It refreshes at most AFG_KNOWLEDGE_REFRESH_MAX documents per run, keeps
 * existing content when a source fails, and never reads private/local URLs.
 * A host cron/scheduler must invoke it; the API server does not start it
 * automatically, to keep small deployments predictable.
 */
const requested = Number(process.env.AFG_KNOWLEDGE_REFRESH_MAX || 5);
const MAX_DOCUMENTS = Number.isInteger(requested) ? Math.max(1, Math.min(20, requested)) : 5;

async function main() {
  if (!pool) {
    process.stdout.write(JSON.stringify({ worker: 'afg-knowledge-refresh', skipped: true, reason: 'database_unavailable' }) + '\n');
    return;
  }
  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock(74062026, 2) AS acquired');
    if (!lock.rows[0]?.acquired) {
      process.stdout.write(JSON.stringify({ worker: 'afg-knowledge-refresh', skipped: true, reason: 'another_refresh_run_is_active' }) + '\n');
      return;
    }
    let candidates;
    try {
      candidates = await pool.query(
        `SELECT id,user_id FROM knowledge_documents
          WHERE source_url IS NOT NULL
            AND refresh_after IS NOT NULL
            AND refresh_after <= now()
          ORDER BY refresh_after ASC
          LIMIT $1`,
        [MAX_DOCUMENTS],
      );
    } catch {
      process.stdout.write(JSON.stringify({
        worker: 'afg-knowledge-refresh',
        skipped: true,
        reason: 'migration_0051_or_database_unavailable',
      }) + '\n');
      return;
    }
    let refreshed = 0, changed = 0, unchanged = 0, failed = 0;
    for (const row of candidates.rows) {
      try {
        const result = await refreshKnowledgeDocument(String(row.user_id), String(row.id));
        refreshed += 1;
        if (result.changed) changed += 1;
        else unchanged += 1;
      } catch {
        // Document ids and source URLs are not logged; private knowledge stays private.
        failed += 1;
      }
    }
    process.stdout.write(JSON.stringify({
      worker: 'afg-knowledge-refresh',
      candidates: candidates.rowCount || 0,
      refreshed,
      changed,
      unchanged,
      failed,
      maxDocumentsPerRun: MAX_DOCUMENTS,
    }) + '\n');
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(74062026, 2)').catch(() => undefined);
    lockClient.release();
    await pool.end().catch(() => undefined);
  }
}

main().catch(() => {
  process.stderr.write('AFG_KNOWLEDGE_REFRESH_WORKER_FAILED\n');
  process.exitCode = 1;
});
