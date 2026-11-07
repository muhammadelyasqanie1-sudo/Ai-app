-- AFG AI per-user browser automation profiles.
-- Browserbase keeps browser cookies/session state in its encrypted remote Context;
-- this table stores only non-secret provider identifiers and recent page metadata.
CREATE TABLE IF NOT EXISTS browser_automation_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  browserbase_context_id text NOT NULL UNIQUE CHECK (char_length(browserbase_context_id) BETWEEN 1 AND 120),
  active_session_id text,
  session_expires_at timestamptz,
  last_url text,
  last_title text,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browser_automation_profiles_activity_idx
  ON browser_automation_profiles(last_activity_at DESC);
