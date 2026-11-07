CREATE TABLE IF NOT EXISTS agent_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_key uuid NOT NULL, input_hash text NOT NULL, objective text NOT NULL CHECK(length(objective) BETWEEN 1 AND 4000),
 model text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','running','waiting_for_approval','completed','failed','cancelled')),
 planning_attempts integer NOT NULL DEFAULT 0, plan jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS agent_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 7), agent text NOT NULL, tool text NOT NULL, input jsonb NOT NULL,
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','running','waiting_for_approval','completed','failed','cancelled')),
 approved_at timestamptz, attempts integer NOT NULL DEFAULT 0, output jsonb, error text, started_at timestamptz, finished_at timestamptz,
 UNIQUE(task_id,position)
);
CREATE TABLE IF NOT EXISTS agent_events (
 id bigserial PRIMARY KEY, task_id uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
 request_id uuid NOT NULL DEFAULT gen_random_uuid(), step_id uuid REFERENCES agent_steps(id) ON DELETE CASCADE, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_tasks_owner_updated ON agent_tasks(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_queue ON agent_tasks(status,created_at);
CREATE INDEX IF NOT EXISTS agent_events_task ON agent_events(task_id,id);
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
-- No public RLS policies: only the trusted backend connects. Every API query scopes task ownership.
