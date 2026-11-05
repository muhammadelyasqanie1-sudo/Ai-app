-- Preserve API connectors while rotating quota-limited services through an owner-scoped queue.
-- A waiting connector is retained; a known upstream reset time automatically makes it eligible again.
ALTER TABLE user_api_connectors
  ADD COLUMN IF NOT EXISTS queue_state text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS next_available_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_api_connectors_queue_state_check'
      AND conrelid = 'user_api_connectors'::regclass
  ) THEN
    ALTER TABLE user_api_connectors
      ADD CONSTRAINT user_api_connectors_queue_state_check
      CHECK (queue_state IN ('ready','waiting'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_api_connectors_queue_idx
  ON user_api_connectors(user_id, queue_state, enabled, status, next_available_at, fallback_priority);
