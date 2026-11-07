-- Track public programming repositories and their published release history.
-- This stores metadata and bounded release notes; it does not clone repositories or run code.
CREATE TABLE IF NOT EXISTS world_knowledge_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner text NOT NULL CHECK (char_length(owner) BETWEEN 1 AND 100),
  repo text NOT NULL CHECK (char_length(repo) BETWEEN 1 AND 100),
  full_name text NOT NULL UNIQUE CHECK (char_length(full_name) BETWEEN 3 AND 220),
  source_id uuid REFERENCES world_knowledge_sources(id) ON DELETE SET NULL,
  default_branch text,
  license_spdx text NOT NULL DEFAULT 'unknown',
  stars integer NOT NULL DEFAULT 0 CHECK (stars >= 0),
  forks integer NOT NULL DEFAULT 0 CHECK (forks >= 0),
  pushed_at timestamptz,
  last_commit_sha text,
  latest_release_tag text,
  latest_release_published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_knowledge_repositories_recent_idx
  ON world_knowledge_repositories(pushed_at DESC NULLS LAST, stars DESC);
CREATE INDEX IF NOT EXISTS world_knowledge_repositories_check_idx
  ON world_knowledge_repositories(last_checked_at ASC NULLS FIRST);

CREATE TABLE IF NOT EXISTS world_knowledge_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES world_knowledge_repositories(id) ON DELETE CASCADE,
  tag_name text NOT NULL CHECK (char_length(tag_name) BETWEEN 1 AND 160),
  release_name text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  html_url text NOT NULL,
  target_commitish text,
  published_at timestamptz,
  prerelease boolean NOT NULL DEFAULT false,
  draft boolean NOT NULL DEFAULT false,
  content_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repository_id, tag_name)
);
CREATE INDEX IF NOT EXISTS world_knowledge_releases_published_idx
  ON world_knowledge_releases(repository_id,published_at DESC NULLS LAST);
