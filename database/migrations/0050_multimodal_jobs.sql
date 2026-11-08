-- Reuse agent_tasks/agent_steps as the only execution queue; binaries remain on private disk.
CREATE TABLE IF NOT EXISTS media_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id uuid NOT NULL UNIQUE REFERENCES agent_tasks(id) ON DELETE CASCADE,
 request jsonb NOT NULL,
 execution_state text NOT NULL DEFAULT 'pending' CHECK(execution_state IN ('pending','executing','completed','failed')),
 result jsonb, usage jsonb, duration_ms integer CHECK(duration_ms>=0),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS media_jobs_owner_created ON media_jobs(user_id,created_at DESC,id);
ALTER TABLE media_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ADD COLUMN IF NOT EXISTS media_job_id uuid REFERENCES media_jobs(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS files_media_job ON files(media_job_id) WHERE media_job_id IS NOT NULL;
-- No public policies: owner authorization is enforced by the existing trusted backend.
