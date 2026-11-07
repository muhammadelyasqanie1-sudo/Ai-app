-- AFG AI Universal Knowledge Engine: curated, provenance-aware shared knowledge.
-- Ingestion is administrator-controlled; retrieved content is always untrusted reference data.
CREATE TABLE IF NOT EXISTS world_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  canonical_url text NOT NULL UNIQUE,
  domain text NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 253),
  source_type text NOT NULL CHECK (source_type IN ('official','academic','research','news','community','documentation','other')),
  trust_level text NOT NULL DEFAULT 'unreviewed' CHECK (trust_level IN ('official','academic','established','community','unreviewed')),
  license_label text NOT NULL DEFAULT 'unknown',
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_knowledge_sources_enabled_idx
  ON world_knowledge_sources(enabled,trust_level,source_type);

CREATE TABLE IF NOT EXISTS world_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES world_knowledge_sources(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 30000),
  topic text NOT NULL DEFAULT 'general' CHECK (char_length(topic) BETWEEN 1 AND 100),
  language text NOT NULL DEFAULT 'unknown' CHECK (language IN ('english','dari','persian','pashto','arabic','urdu','russian','other','unknown')),
  evidence_type text NOT NULL DEFAULT 'reference' CHECK (evidence_type IN ('fact','research','theory','opinion','experience','news','reference','unverified')),
  confidence numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
  published_at timestamptz,
  content_hash char(64) NOT NULL UNIQUE,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple',coalesce(title,'')),'A') ||
    setweight(to_tsvector('simple',coalesce(topic,'')),'B') ||
    setweight(to_tsvector('simple',coalesce(content,'')),'C')
  ) STORED,
  ingested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_knowledge_documents_search_idx
  ON world_knowledge_documents USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS world_knowledge_documents_source_idx
  ON world_knowledge_documents(source_id,created_at DESC);
