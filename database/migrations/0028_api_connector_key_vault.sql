-- Encrypted, owner-scoped secondary credentials for a single API connector.
-- Key selection is manual: AFG AI never rotates keys to evade a provider quota.
CREATE TABLE IF NOT EXISTS user_api_connector_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES user_api_connectors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  credential_encrypted text NOT NULL,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connector_id, label)
);
CREATE INDEX IF NOT EXISTS user_api_connector_keys_owner_idx
  ON user_api_connector_keys(user_id, connector_id, priority, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS user_api_connector_keys_one_active_idx
  ON user_api_connector_keys(connector_id) WHERE is_active = true;

-- Preserve each existing connector credential as its initial named key.
INSERT INTO user_api_connector_keys(connector_id,user_id,label,credential_encrypted,priority,is_active)
SELECT id,user_id,'Primary key',credential_encrypted,100,true
FROM user_api_connectors
WHERE credential_encrypted IS NOT NULL
ON CONFLICT (connector_id,label) DO NOTHING;
