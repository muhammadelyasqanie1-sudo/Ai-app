-- Preserve every API credential and rotate through the owner's ordered key queue on observed quota failures.
ALTER TABLE user_api_connector_keys
  ADD COLUMN IF NOT EXISTS queue_state text NOT NULL DEFAULT 'ready'
    CHECK (queue_state IN ('ready','waiting','needs_review')),
  ADD COLUMN IF NOT EXISTS next_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_quota_status integer,
  ADD COLUMN IF NOT EXISTS last_quota_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_quota_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

CREATE INDEX IF NOT EXISTS user_api_connector_keys_rotation_idx
  ON user_api_connector_keys(connector_id,queue_state,priority,created_at)
  WHERE queue_state='ready' AND is_active=false;
