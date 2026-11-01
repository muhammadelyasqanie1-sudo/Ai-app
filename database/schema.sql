-- AFG AI production data foundation (PostgreSQL 15+)
-- Apply with: psql "$DATABASE_URL" -f database/schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  display_name text,
  avatar_url text,
  preferred_language text NOT NULL DEFAULT 'dari',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  model text,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content text NOT NULL,
  model text,
  token_input integer,
  token_output integer,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('pending','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  default_model text,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  model_key text NOT NULL,
  display_name text NOT NULL,
  capabilities text[] NOT NULL DEFAULT ARRAY['chat'],
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(provider_key, model_key)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider_key text NOT NULL,
  model_key text,
  capability text NOT NULL DEFAULT 'chat',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_microusd bigint NOT NULL DEFAULT 0,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_created_idx ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_provider_created_idx ON usage_events(provider_key, created_at DESC);

CREATE TABLE IF NOT EXISTS generated_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('image','video','audio','file')),
  prompt text,
  storage_key text NOT NULL,
  mime_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_user_created_idx ON generated_assets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['chat'],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);


-- Additive account and provider-control fields. Safe to apply after the original schema.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_model text;

ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS context_window integer NOT NULL DEFAULT 0;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS input_cost_per_million numeric(14,6);
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS output_cost_per_million numeric(14,6);
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS last_health_ok boolean NOT NULL DEFAULT false;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS provider_fallback_chains (
  capability text PRIMARY KEY CHECK (capability IN ('text','vision','imageGen','tts','stt')),
  ordered_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_status_idx ON users(role, status);
CREATE INDEX IF NOT EXISTS model_catalog_enabled_idx ON model_catalog(provider_key, enabled);

ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS health_checked_at timestamptz;


-- Productivity, privacy-controlled memory, account verification and preferences.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS memory_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email','password_reset')),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_codes_user_purpose_idx ON email_verification_codes(user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'dari' CHECK (language IN ('dari','english')),
  appearance text NOT NULL DEFAULT 'system' CHECK (appearance IN ('light','dark','neon','system')),
  accent_color text NOT NULL DEFAULT 'cyan',
  density text NOT NULL DEFAULT 'comfortable' CHECK (density IN ('compact','comfortable','spacious')),
  font_size integer NOT NULL DEFAULT 14 CHECK (font_size BETWEEN 12 AND 20),
  chat_width text NOT NULL DEFAULT 'comfortable' CHECK (chat_width IN ('narrow','comfortable','wide')),
  animations_enabled boolean NOT NULL DEFAULT true,
  default_model text,
  auto_select_model boolean NOT NULL DEFAULT true,
  response_style text NOT NULL DEFAULT 'balanced',
  response_length text NOT NULL DEFAULT 'medium',
  creativity numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (creativity BETWEEN 0 AND 1),
  memory_enabled boolean NOT NULL DEFAULT true,
  voice_enabled boolean NOT NULL DEFAULT true,
  default_language text NOT NULL DEFAULT 'dari',
  notifications_json jsonb NOT NULL DEFAULT '{"inApp":true,"email":false,"productUpdates":false,"usageAlerts":true,"securityAlerts":true}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('preferences','language','style','facts')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  consent_sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_memories_owner_idx ON user_memories(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS productivity_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_type text NOT NULL CHECK (tool_type IN ('note','summary','idea','study','task','meeting','email','brainstorm','content_plan','knowledge')),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS productivity_items_owner_updated_idx ON productivity_items(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_events_owner_idx ON user_notification_events(user_id, created_at DESC);
