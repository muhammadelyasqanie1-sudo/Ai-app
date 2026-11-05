-- Keep provider credentials through monthly renewal cycles; never infer expiry dates.
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
