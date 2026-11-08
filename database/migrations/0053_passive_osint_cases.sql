-- Backend-only, owner-scoped passive OSINT evidence graph.
CREATE TABLE IF NOT EXISTS osint_cases(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,title text NOT NULL,target_type text NOT NULL CHECK(target_type IN('domain','ip','sha256')),target_value text NOT NULL,status text NOT NULL DEFAULT 'completed' CHECK(status IN('completed','partial')),warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS osint_cases_owner_created_idx ON osint_cases(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS osint_entities(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES osint_cases(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,entity_type text NOT NULL,entity_value text NOT NULL,metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(case_id,entity_type,entity_value));
CREATE INDEX IF NOT EXISTS osint_entities_owner_case_idx ON osint_entities(user_id,case_id);
CREATE TABLE IF NOT EXISTS osint_observations(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES osint_cases(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind text NOT NULL,source_url text,confidence text NOT NULL DEFAULT 'source-reported',payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS osint_observations_owner_case_idx ON osint_observations(user_id,case_id,created_at);
CREATE TABLE IF NOT EXISTS osint_edges(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES osint_cases(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,source_entity_id uuid NOT NULL REFERENCES osint_entities(id) ON DELETE CASCADE,target_entity_id uuid NOT NULL REFERENCES osint_entities(id) ON DELETE CASCADE,relation text NOT NULL,observation_id uuid REFERENCES osint_observations(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(case_id,source_entity_id,target_entity_id,relation));
CREATE INDEX IF NOT EXISTS osint_edges_owner_case_idx ON osint_edges(user_id,case_id);
ALTER TABLE osint_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE osint_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE osint_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE osint_edges ENABLE ROW LEVEL SECURITY;
INSERT INTO feature_flags(flag_key,enabled,description) VALUES('osint',true,'Enable owner-scoped passive OSINT and evidence graph') ON CONFLICT(flag_key) DO NOTHING;