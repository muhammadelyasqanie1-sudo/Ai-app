-- Optional server-side catalog and explicitly consented learning sync.
-- No endpoint writes these tables until the user enables sync.
CREATE TABLE IF NOT EXISTS pack_registry (
  id text PRIMARY KEY,
  name text NOT NULL,
  version text NOT NULL,
  subjects_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  languages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-fA-F0-9]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  publisher text NOT NULL,
  signature text NOT NULL,
  published_at timestamptz NOT NULL,
  approved_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS pack_versions (
  id bigserial PRIMARY KEY,
  pack_id text NOT NULL REFERENCES pack_registry(id) ON DELETE CASCADE,
  version text NOT NULL,
  changelog text NOT NULL DEFAULT '',
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-fA-F0-9]{64}$'),
  published_at timestamptz NOT NULL,
  UNIQUE(pack_id,version)
);
CREATE TABLE IF NOT EXISTS offline_sync_consents (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS offline_usage (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES pack_registry(id) ON DELETE RESTRICT,
  lesson_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lesson','quiz','flashcard','practice')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES pack_registry(id) ON DELETE RESTRICT,
  lesson_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('not_started','in_progress','completed')),
  score numeric(5,2) CHECK (score IS NULL OR (score>=0 AND score<=100)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,pack_id,lesson_id)
);
CREATE INDEX IF NOT EXISTS offline_usage_user_created_idx ON offline_usage(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_progress_user_updated_idx ON lesson_progress(user_id,updated_at DESC);
