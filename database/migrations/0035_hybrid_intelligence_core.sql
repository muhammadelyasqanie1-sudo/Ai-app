-- AFG AI hybrid intelligence: private knowledge retrieval and opt-in fine-tuning examples.
-- User memories already exist; this migration adds private RAG documents and explicitly consented examples.
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 30000),
  source_label text NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_documents_owner_updated_idx
  ON knowledge_documents(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_search_idx
  ON knowledge_documents USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS training_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 10000),
  ideal_answer text NOT NULL CHECK (char_length(ideal_answer) BETWEEN 1 AND 20000),
  consented_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_examples_owner_created_idx
  ON training_examples(user_id, created_at DESC);
