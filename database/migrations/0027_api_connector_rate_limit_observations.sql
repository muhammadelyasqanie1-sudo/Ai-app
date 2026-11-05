-- Persist only observed upstream quota headers and reset information.
-- Missing reset timestamps remain NULL; AFG AI never guesses a provider renewal date.
ALTER TABLE user_api_connectors
  ADD COLUMN IF NOT EXISTS rate_limit_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_quota_status integer,
  ADD COLUMN IF NOT EXISTS last_quota_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_quota_reset_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_api_connectors_last_quota_status_check'
      AND conrelid = 'user_api_connectors'::regclass
  ) THEN
    ALTER TABLE user_api_connectors
      ADD CONSTRAINT user_api_connectors_last_quota_status_check
      CHECK (last_quota_status IS NULL OR last_quota_status IN (402,429));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_api_connectors_quota_reset_idx
  ON user_api_connectors(user_id, queue_state, last_quota_reset_at)
  WHERE queue_state = 'waiting';
