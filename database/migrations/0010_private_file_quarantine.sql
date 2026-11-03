-- Private upload metadata. Bytes remain in a server-side quarantine directory.
-- No public URL or AI ingestion is exposed until a scanner is integrated.
ALTER TABLE files ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT 'file';
ALTER TABLE files ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'quarantined'
  CHECK(status IN ('quarantined','approved','rejected'));
ALTER TABLE files ADD COLUMN IF NOT EXISTS sha256 text;
CREATE INDEX IF NOT EXISTS files_user_status_created_idx ON files(user_id,status,created_at DESC);
