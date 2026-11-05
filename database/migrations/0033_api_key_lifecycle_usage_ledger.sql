-- Preserve every provider key across monthly renewal cycles and record actual connector usage.
ALTER TABLE user_api_connector_keys
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_status_code integer;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_api_connector_keys_lifecycle_state_check' AND conrelid='user_api_connector_keys'::regclass) THEN
  ALTER TABLE user_api_connector_keys ADD CONSTRAINT user_api_connector_keys_lifecycle_state_check CHECK(lifecycle_state IN ('active','waiting','expired','revoked'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS user_api_connector_keys_rotation_idx
 ON user_api_connector_keys(user_id,lifecycle_state,renewal_due_at,priority,created_at);

CREATE TABLE IF NOT EXISTS user_api_connector_usage (
 id bigserial PRIMARY KEY,
 user_id uuid NOT NULL,
 connector_id uuid NOT NULL REFERENCES user_api_connectors(id) ON DELETE CASCADE,
 key_id uuid,
 request_id text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('success','quota_limited','auth_failed','upstream_error','network_error','rejected')),
 http_status integer,
 duration_ms integer,
 estimated_cost numeric(18,8),
 currency text NOT NULL DEFAULT 'USD',
 provider_request_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_api_connector_usage_owner_time_idx ON user_api_connector_usage(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS user_api_connector_usage_connector_time_idx ON user_api_connector_usage(connector_id,created_at DESC);
