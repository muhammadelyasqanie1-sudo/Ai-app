-- Add owner-scoped fallback groups for equivalent Public API connectors.
-- A connector may only fall back to another verified connector owned by the same user,
-- with the same HTTP method and exact input schema.
ALTER TABLE user_api_connectors
  ADD COLUMN IF NOT EXISTS fallback_group text,
  ADD COLUMN IF NOT EXISTS fallback_priority integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_api_connectors_fallback_group_check'
      AND conrelid = 'user_api_connectors'::regclass
  ) THEN
    ALTER TABLE user_api_connectors
      ADD CONSTRAINT user_api_connectors_fallback_group_check
      CHECK (fallback_group IS NULL OR fallback_group ~ '^[a-z0-9][a-z0-9_-]{1,63}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_api_connectors_fallback_priority_check'
      AND conrelid = 'user_api_connectors'::regclass
  ) THEN
    ALTER TABLE user_api_connectors
      ADD CONSTRAINT user_api_connectors_fallback_priority_check
      CHECK (fallback_priority BETWEEN 1 AND 1000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_api_connectors_fallback_idx
  ON user_api_connectors(user_id, fallback_group, enabled, status, fallback_priority)
  WHERE fallback_group IS NOT NULL;
