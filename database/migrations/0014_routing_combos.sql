-- AFG AI OmniRoute-style routing combos.
-- Models are stored as providerId::modelId and are validated against the live verified catalog at request time.
CREATE TABLE IF NOT EXISTS routing_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(48) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  display_name varchar(80) NOT NULL,
  strategy text NOT NULL DEFAULT 'fallback' CHECK (strategy IN ('fallback','round_robin')),
  model_ids text[] NOT NULL,
  fallback_on_error boolean NOT NULL DEFAULT true,
  next_index integer NOT NULL DEFAULT 0 CHECK (next_index >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(model_ids) BETWEEN 1 AND 20),
  CHECK (array_position(model_ids, NULL) IS NULL)
);
CREATE INDEX IF NOT EXISTS routing_combos_enabled_idx ON routing_combos(enabled, slug);
