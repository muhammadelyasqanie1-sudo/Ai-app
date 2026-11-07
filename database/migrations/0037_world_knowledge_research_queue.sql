-- Continuous, topic-agnostic research queue for AFG AI.
-- Queue workers may use approved search providers; this table never fetches arbitrary URLs.
CREATE TABLE IF NOT EXISTS world_knowledge_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL CHECK (char_length(query) BETWEEN 3 AND 500),
  language text NOT NULL DEFAULT 'unknown'
    CHECK (language IN ('english','dari','persian','pashto','arabic','urdu','russian','other','unknown')),
  priority integer NOT NULL DEFAULT 5 CHECK (priority BETWEEN 0 AND 10),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  query_hash char(64) NOT NULL UNIQUE,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  claimed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  lease_until timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_knowledge_research_jobs_ready_idx
  ON world_knowledge_research_jobs(status,priority DESC,next_run_at,created_at);
CREATE INDEX IF NOT EXISTS world_knowledge_research_jobs_lease_idx
  ON world_knowledge_research_jobs(lease_until)
  WHERE status='processing';
