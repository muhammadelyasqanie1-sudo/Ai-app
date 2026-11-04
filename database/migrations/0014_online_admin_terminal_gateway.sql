-- Online Admin Terminal Gateway: durable AI jobs for a separately hosted worker.
-- This is a task queue, not a general-purpose shell. User-supplied shell commands are never executed.
CREATE TABLE IF NOT EXISTS admin_terminal_gateway_workers (
  worker_id text PRIMARY KEY,
  hostname text NOT NULL,
  version text NOT NULL DEFAULT '1',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_terminal_gateway_workers_seen_idx
  ON admin_terminal_gateway_workers(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS admin_terminal_gateway_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id text NOT NULL UNIQUE,
  model text NOT NULL DEFAULT 'auto' CHECK (char_length(model) BETWEEN 1 AND 300),
  messages jsonb NOT NULL CHECK (jsonb_typeof(messages) = 'array'),
  no_fallback boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  output_text text,
  error_code varchar(80),
  provider_id text,
  model_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS admin_terminal_gateway_jobs_queue_idx
  ON admin_terminal_gateway_jobs(created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS admin_terminal_gateway_jobs_owner_idx
  ON admin_terminal_gateway_jobs(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_terminal_gateway_jobs_expiry_idx
  ON admin_terminal_gateway_jobs(expires_at)
  WHERE status IN ('queued','running');

COMMENT ON TABLE admin_terminal_gateway_jobs IS
  'Admin-only durable AI task queue processed by the isolated AFG AI terminal worker; never a shell command queue.';
