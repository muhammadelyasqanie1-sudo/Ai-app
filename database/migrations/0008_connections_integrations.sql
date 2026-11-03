-- AFG AI Connections & Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  icon_name text NOT NULL DEFAULT 'plug',
  category text NOT NULL CHECK (category IN ('auth','search','messaging','dev_tools','storage','mcp')),
  enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('unconfigured','active','error','disabled')),
  last_checked_at timestamptz,
  last_check_ok boolean,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  credential_key varchar(64) NOT NULL,
  credential_value_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, credential_key)
);
CREATE TABLE IF NOT EXISTS integration_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_user_id text,
  provider_username text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(integration_id,user_id)
);
CREATE INDEX IF NOT EXISTS integration_user_links_active_idx ON integration_user_links(integration_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS ftp_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  host text NOT NULL,
  port integer NOT NULL CHECK(port BETWEEN 1 AND 65535),
  protocol text NOT NULL CHECK(protocol IN ('ftp','sftp')),
  remote_path text NOT NULL DEFAULT '/',
  local_path_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  command text NOT NULL,
  args_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  env_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'stopped' CHECK(status IN ('stopped','running','error')),
  last_ping_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_rate_limits (
  integration_id uuid PRIMARY KEY REFERENCES integrations(id) ON DELETE CASCADE,
  requests integer NOT NULL DEFAULT 60 CHECK(requests BETWEEN 1 AND 10000),
  window_seconds integer NOT NULL DEFAULT 60 CHECK(window_seconds BETWEEN 1 AND 86400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_rate_counters (
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY(integration_id,user_id,window_start)
);
INSERT INTO integrations(slug,display_name,icon_name,category,config_json) VALUES
 ('github','GitHub','github','dev_tools','{"auth_mode":"personal_access_token","oauth_ready":false}'::jsonb),
 ('web-search','Web Search','search','search','{"provider":"tavily"}'::jsonb),
 ('telegram','Telegram','send','messaging','{}'::jsonb),
 ('ftp-sftp','FTP / SFTP Sync','folder-sync','storage','{"protocol":"sftp"}'::jsonb),
 ('ftp-server','FTP Server','server','storage','{"supported":false,"reason":"A dedicated isolated file-transfer service is required."}'::jsonb),
 ('mcp','MCP Servers','network','mcp','{"sandbox_required":true}'::jsonb)
ON CONFLICT(slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS mcp_server_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  credential_key varchar(64) NOT NULL,
  credential_value_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_id,credential_key)
);

INSERT INTO integration_rate_limits(integration_id,requests,window_seconds)
SELECT id,12,60 FROM integrations WHERE slug='web-search'
ON CONFLICT(integration_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS integration_user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_key varchar(64) NOT NULL,
  credential_value_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id,user_id,credential_key)
);
