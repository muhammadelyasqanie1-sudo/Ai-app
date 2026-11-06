-- Add explicit renewal lifecycle metadata without colliding with the quota-key queue migration 0033.
ALTER TABLE user_api_connector_keys
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_code integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='user_api_connector_keys_lifecycle_state_check'
      AND conrelid='user_api_connector_keys'::regclass
  ) THEN
    ALTER TABLE user_api_connector_keys
      ADD CONSTRAINT user_api_connector_keys_lifecycle_state_check
      CHECK (lifecycle_state IN ('active','waiting','expired','revoked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_api_connector_keys_lifecycle_idx
  ON user_api_connector_keys(user_id,lifecycle_state,renewal_due_at,priority,created_at);
