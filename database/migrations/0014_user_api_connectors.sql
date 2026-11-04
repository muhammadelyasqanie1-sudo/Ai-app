-- User-owned generic HTTP API connectors. Credentials are encrypted and each request
-- is executed server-side only after the owner explicitly verifies and enables it.
CREATE TABLE IF NOT EXISTS user_api_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_source_key text REFERENCES public_api_catalog(source_key) ON DELETE SET NULL,
  name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 120),
  tool_name text NOT NULL CHECK(tool_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
  endpoint_url text NOT NULL CHECK(endpoint_url ~ '^https://'),
  http_method text NOT NULL DEFAULT 'GET' CHECK(http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  auth_type text NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none','bearer','header_key')),
  auth_header_name text NOT NULL DEFAULT 'X-API-Key',
  credential_encrypted text,
  input_schema_json jsonb NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
  sample_arguments_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','verified','disabled','error')),
  last_tested_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,tool_name)
);
CREATE INDEX IF NOT EXISTS user_api_connectors_owner_idx ON user_api_connectors(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS user_api_connectors_status_idx ON user_api_connectors(user_id,enabled,status);
CREATE TABLE IF NOT EXISTS user_api_connector_runs (
  id bigserial PRIMARY KEY,
  connector_id uuid NOT NULL REFERENCES user_api_connectors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  http_method text NOT NULL,
  http_status integer,
  duration_ms integer NOT NULL DEFAULT 0,
  outcome text NOT NULL CHECK(outcome IN ('success','error','rate_limited')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_api_connector_runs_owner_idx ON user_api_connector_runs(user_id,created_at DESC);
