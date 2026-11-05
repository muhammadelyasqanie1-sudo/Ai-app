-- Opt-in scheduled health monitoring for safe, idempotent GET connectors.
ALTER TABLE user_api_connectors
  ADD COLUMN IF NOT EXISTS health_monitor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_monitor_interval_minutes integer NOT NULL DEFAULT 360
    CHECK (health_monitor_interval_minutes BETWEEN 60 AND 10080),
  ADD COLUMN IF NOT EXISTS next_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_monitor_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_diagnosis text;

CREATE INDEX IF NOT EXISTS user_api_connectors_health_due_idx
  ON user_api_connectors(next_health_check_at,health_monitor_claimed_at)
  WHERE health_monitor_enabled=true AND enabled=true AND http_method='GET';
