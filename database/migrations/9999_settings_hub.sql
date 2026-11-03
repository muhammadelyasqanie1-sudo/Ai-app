-- Settings Hub: global non-secret configuration registry.
-- Provider/integration credentials remain in the existing AES-256-GCM encrypted
-- integration_credentials tables; this table must never contain plaintext secrets.
CREATE TABLE IF NOT EXISTS system_config (
  config_key text PRIMARY KEY,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_settings is already the canonical per-user locale/settings identity table.
-- The detailed preference values remain in user_preferences for backwards compatibility.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS settings_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS system_config_updated_at_idx ON system_config(updated_at DESC);
