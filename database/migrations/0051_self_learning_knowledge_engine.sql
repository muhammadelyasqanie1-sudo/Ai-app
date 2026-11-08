-- AFG AI Self-Learning Knowledge Engine.
-- Extends the user-owned knowledge store with provenance, classification,
-- chunk-level retrieval, research provenance, freshness and optional embeddings.
-- All content remains untrusted reference data; nothing here executes code or
-- treats retrieved text as instructions.

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user_text',
  ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'user_provided',
  ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS content_hash char(64),
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_after timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS embedding jsonb,
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- Larger user documents (books, long documentation) are stored once and
-- split into chunks for retrieval. The original 30,000-character ceiling was
-- too small for that use case.
ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_content_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_content_check
  CHECK (char_length(content) BETWEEN 1 AND 400000);

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_category_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_category_check
  CHECK (category IN (
    'programming','ai-ml','security','frontend','backend','databases','devops',
    'mobile','architecture','documentation','research','general','other'
  ));

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_source_type_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_source_type_check
  CHECK (source_type IN ('user_text','file','web','documentation','repository','research'));

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_trust_level_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_trust_level_check
  CHECK (trust_level IN ('official','academic','established','community','user_provided','unverified'));

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_verification_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_verification_check
  CHECK (verification IN ('official','multi_source','single_source','user_corrected','unverified'));

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_source_url_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_source_url_check
  CHECK (source_url IS NULL OR (char_length(source_url) BETWEEN 8 AND 2048 AND source_url ~* '^https?://'));

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_owner_hash_uidx
  ON knowledge_documents(user_id, content_hash)
  WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_documents_owner_category_idx
  ON knowledge_documents(user_id, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_owner_verification_idx
  ON knowledge_documents(user_id, verification, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_refresh_idx
  ON knowledge_documents(refresh_after)
  WHERE refresh_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_documents_tags_idx
  ON knowledge_documents USING GIN(tags);

-- Chunk-level retrieval keeps citations precise and avoids injecting whole
-- long documents into a chat prompt.
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index BETWEEN 0 AND 499),
  heading text NOT NULL DEFAULT '' CHECK (char_length(heading) <= 240),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  content_hash char(64) NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(heading,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content,'')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_owner_idx
  ON knowledge_chunks(user_id, document_id, chunk_index);
CREATE INDEX IF NOT EXISTS knowledge_chunks_search_idx
  ON knowledge_chunks USING GIN(search_vector);

-- A deep-research run groups the sources that were actually read, the exact
-- citations returned to the user, and any sources that could not be read.
CREATE TABLE IF NOT EXISTS knowledge_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query text NOT NULL CHECK (char_length(query) BETWEEN 3 AND 500),
  depth text NOT NULL DEFAULT 'standard' CHECK (depth IN ('standard','deep')),
  categories text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  search_provider text,
  sources_discovered integer NOT NULL DEFAULT 0 CHECK (sources_discovered >= 0),
  sources_read integer NOT NULL DEFAULT 0 CHECK (sources_read >= 0),
  documents_saved integer NOT NULL DEFAULT 0 CHECK (documents_saved >= 0),
  report text NOT NULL DEFAULT '',
  citations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(citations) = 'array'),
  verification_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verification_summary) = 'object'),
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_research_runs_owner_created_idx
  ON knowledge_research_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_research_runs_rate_idx
  ON knowledge_research_runs(user_id, created_at)
  WHERE status IN ('running','completed');

CREATE TABLE IF NOT EXISTS knowledge_research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES knowledge_research_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES knowledge_documents(id) ON DELETE SET NULL,
  url text NOT NULL CHECK (char_length(url) BETWEEN 8 AND 2048),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 300),
  domain text NOT NULL DEFAULT '' CHECK (char_length(domain) <= 253),
  trust_level text NOT NULL DEFAULT 'unverified'
    CHECK (trust_level IN ('official','academic','established','community','user_provided','unverified')),
  verification text NOT NULL DEFAULT 'unverified'
    CHECK (verification IN ('official','multi_source','single_source','user_corrected','unverified')),
  fetch_method text NOT NULL DEFAULT 'search'
    CHECK (fetch_method IN ('search','browser','user')),
  status text NOT NULL DEFAULT 'read' CHECK (status IN ('read','failed','skipped')),
  published_at timestamptz,
  content_hash char(64),
  summary text NOT NULL DEFAULT '',
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(key_points) = 'array'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_research_sources_run_idx
  ON knowledge_research_sources(run_id, status);

-- These tables are backend-only, matching the private knowledge API model.
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_research_sources ENABLE ROW LEVEL SECURITY;
