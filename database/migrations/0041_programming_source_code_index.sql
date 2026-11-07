-- Bounded, provenance-linked source-code and dependency metadata from public repositories.
-- Indexed source is never executed, evaluated, installed, or treated as trusted instructions.
CREATE TABLE IF NOT EXISTS world_knowledge_code_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES world_knowledge_repositories(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 700),
  language text NOT NULL DEFAULT 'unknown' CHECK (char_length(language) <= 40),
  blob_sha text,
  html_url text NOT NULL,
  license_spdx text NOT NULL DEFAULT 'unknown',
  content text NOT NULL DEFAULT '',
  symbols jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(symbols)='array'),
  dependencies jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dependencies)='object'),
  content_hash char(64) NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repository_id,path)
);
CREATE INDEX IF NOT EXISTS world_knowledge_code_files_repo_idx
  ON world_knowledge_code_files(repository_id,path);
CREATE INDEX IF NOT EXISTS world_knowledge_code_files_language_idx
  ON world_knowledge_code_files(language);
CREATE INDEX IF NOT EXISTS world_knowledge_code_files_hash_idx
  ON world_knowledge_code_files(content_hash);
