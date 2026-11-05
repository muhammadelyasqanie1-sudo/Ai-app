-- OAuth 2.0 authorization-code + PKCE for owner-managed API connectors.
ALTER TABLE user_api_connectors
  ADD COLUMN IF NOT EXISTS oauth_config_encrypted text;

ALTER TABLE user_api_connectors
  DROP CONSTRAINT IF EXISTS user_api_connectors_auth_type_check;
ALTER TABLE user_api_connectors
  ADD CONSTRAINT user_api_connectors_auth_type_check
  CHECK (auth_type IN ('none','bearer','basic','header_key','query_key','oauth2'));

CREATE TABLE IF NOT EXISTS user_api_connector_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES user_api_connectors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  code_verifier_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_api_connector_oauth_states_expiry_idx
  ON user_api_connector_oauth_states(expires_at);
