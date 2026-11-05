-- Serialize owner-triggered quota recovery probes so concurrent requests cannot double-probe.
ALTER TABLE user_api_connectors
  ADD COLUMN IF NOT EXISTS quota_recovery_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS user_api_connectors_quota_recovery_claim_idx
  ON user_api_connectors(user_id,quota_recovery_claimed_at,last_quota_reset_at)
  WHERE last_quota_status IN (402,429) AND last_quota_reset_at IS NOT NULL;
