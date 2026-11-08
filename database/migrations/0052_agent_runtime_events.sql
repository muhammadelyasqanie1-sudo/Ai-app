-- Durable runtime observability for the existing agent/media queue.
-- This extends migrations 0049/0050; it does not create a competing task system.
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS progress smallint NOT NULL DEFAULT 0
    CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agent_events
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS agent_events_task_stream_idx
  ON agent_events(task_id, id);

CREATE INDEX IF NOT EXISTS agent_tasks_stale_runtime_idx
  ON agent_tasks(status, heartbeat_at)
  WHERE status = 'running';

-- Existing media_jobs already links each media operation to its durable agent task.
-- Progress is sourced from agent_tasks; no duplicate progress counter is introduced.
