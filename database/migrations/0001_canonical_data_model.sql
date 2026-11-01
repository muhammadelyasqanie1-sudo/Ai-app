-- AFG AI canonical relational data model. Additive; legacy API columns remain intact.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
UPDATE users SET email_verified_at=COALESCE(email_verified_at,updated_at) WHERE email_verified=true AND email_verified_at IS NULL;
CREATE INDEX IF NOT EXISTS users_updated_idx ON users(updated_at DESC);
CREATE INDEX IF NOT EXISTS users_email_active_idx ON users(lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS profiles(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,display_name text,avatar_url text,locale text NOT NULL DEFAULT 'dari',timezone text NOT NULL DEFAULT 'UTC',bio text,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO profiles(user_id,display_name,avatar_url,locale) SELECT id,display_name,avatar_url,preferred_language FROM users ON CONFLICT(user_id) DO NOTHING;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip inet;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE INDEX IF NOT EXISTS sessions_user_created_idx ON sessions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_active_expiry_idx ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_settings(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,theme text NOT NULL DEFAULT 'system',accent text NOT NULL DEFAULT 'cyan',density text NOT NULL DEFAULT 'comfortable',font_size integer NOT NULL DEFAULT 14 CHECK(font_size BETWEEN 10 AND 24),default_model text,auto_model boolean NOT NULL DEFAULT true,response_style text NOT NULL DEFAULT 'balanced',response_length text NOT NULL DEFAULT 'medium',creativity numeric(3,2) NOT NULL DEFAULT 0.70 CHECK(creativity BETWEEN 0 AND 1),memory_enabled boolean NOT NULL DEFAULT true,voice_id text,default_language text NOT NULL DEFAULT 'dari',notifications_json jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO user_settings(user_id,theme,accent,density,font_size,default_model,auto_model,response_style,response_length,creativity,memory_enabled,default_language,notifications_json)
SELECT user_id,appearance,accent_color,density,font_size,default_model,auto_select_model,response_style,response_length,creativity,memory_enabled,default_language,notifications_json FROM user_preferences ON CONFLICT(user_id) DO NOTHING;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model_id text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON conversations(user_id,updated_at DESC);
UPDATE conversations SET model_id=model WHERE model_id IS NULL AND model IS NOT NULL;
UPDATE conversations SET archived=(archived_at IS NOT NULL) WHERE archived_at IS NOT NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS model_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tokens_in integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tokens_out integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS latency_ms integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_document tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce(content,''))) STORED;
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id,created_at);
CREATE INDEX IF NOT EXISTS messages_parent_idx ON messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_search_gin_idx ON messages USING gin(search_document);
UPDATE messages SET model_id=model WHERE model_id IS NULL AND model IS NOT NULL;
UPDATE messages SET tokens_in=token_input WHERE tokens_in IS NULL;
UPDATE messages SET tokens_out=token_output WHERE tokens_out IS NULL;

CREATE TABLE IF NOT EXISTS providers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL UNIQUE,display_name text NOT NULL,config_encrypted text,enabled boolean NOT NULL DEFAULT false,last_health_at timestamptz,last_health_ok boolean,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO providers(kind,display_name,enabled) SELECT provider_key,display_name,enabled FROM provider_configs ON CONFLICT(kind) DO UPDATE SET display_name=EXCLUDED.display_name,enabled=EXCLUDED.enabled;
CREATE TABLE IF NOT EXISTS models(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,display_name text NOT NULL,description text,context_window integer NOT NULL DEFAULT 0,capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,enabled boolean NOT NULL DEFAULT true,verified_at timestamptz,provider_model_key text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider_id,provider_model_key));
INSERT INTO models(provider_id,display_name,description,context_window,capabilities_json,enabled,verified_at,provider_model_key)
SELECT p.id,m.display_name,m.model_key,m.context_window,COALESCE(to_jsonb(m.capabilities),'{}'::jsonb),m.enabled,m.verified_at,m.model_key FROM model_catalog m JOIN providers p ON p.kind=m.provider_key
ON CONFLICT(provider_id,provider_model_key) DO UPDATE SET display_name=EXCLUDED.display_name,context_window=EXCLUDED.context_window,capabilities_json=EXCLUDED.capabilities_json,enabled=EXCLUDED.enabled,verified_at=EXCLUDED.verified_at;

CREATE TABLE IF NOT EXISTS usage_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE SET NULL,model_id text,kind text NOT NULL DEFAULT 'chat',tokens_in integer NOT NULL DEFAULT 0,tokens_out integer NOT NULL DEFAULT 0,cost_usd numeric(18,8) NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO usage_records(user_id,model_id,kind,tokens_in,tokens_out,cost_usd,created_at) SELECT user_id,COALESCE(model_key,provider_key),capability,input_tokens,output_tokens,cost_microusd::numeric/1000000,created_at FROM usage_events;

CREATE TABLE IF NOT EXISTS files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind text NOT NULL,mime text,size_bytes bigint NOT NULL DEFAULT 0 CHECK(size_bytes>=0),storage_key text NOT NULL,extracted_text_ref text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS files_user_created_idx ON files(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,prompt text NOT NULL DEFAULT '',model_id text,storage_key text NOT NULL,width integer,height integer,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS images_user_created_idx ON images(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS user_memory(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,category text NOT NULL,content text NOT NULL,consent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO user_memory(user_id,category,content,consent_at,created_at,updated_at) SELECT user_id,category,content,CASE WHEN consent_sensitive THEN created_at ELSE NULL END,created_at,updated_at FROM user_memories;

CREATE TABLE IF NOT EXISTS roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL UNIQUE,permissions_json jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO roles(name,permissions_json) VALUES('user','{"chat":true,"profile:read":true,"profile:write":true}'::jsonb),('admin','{"*":true}'::jsonb) ON CONFLICT(name) DO NOTHING;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip inet;
UPDATE audit_logs SET actor_id=actor_user_id WHERE actor_id IS NULL;
UPDATE audit_logs SET target=concat_ws(':',target_type,target_id) WHERE target IS NULL;
UPDATE audit_logs SET metadata_json=metadata WHERE metadata_json='{}'::jsonb AND metadata IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_actor_created_idx ON audit_logs(actor_id,created_at DESC);

CREATE TABLE IF NOT EXISTS system_config(key text PRIMARY KEY,value_json jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS subscription_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_key text NOT NULL UNIQUE,display_name text NOT NULL,monthly_price_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK(monthly_price_usd>=0),limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,features_json jsonb NOT NULL DEFAULT '{}'::jsonb,enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO subscription_plans(plan_key,display_name,monthly_price_usd,limits_json,features_json) VALUES('free','Free',0,'{"requests_per_day":50,"max_context_tokens":16000}'::jsonb,'{"chat":true,"image_generation":false,"file_processing":false}'::jsonb),('pro','Pro',9.99,'{"requests_per_day":1000,"max_context_tokens":128000}'::jsonb,'{"chat":true,"image_generation":true,"file_processing":true}'::jsonb) ON CONFLICT(plan_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,status text NOT NULL DEFAULT 'active' CHECK(status IN ('trialing','active','past_due','cancelled','expired')),starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz,provider text,external_reference text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx ON user_subscriptions(user_id,status,ends_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_external_ref_idx ON user_subscriptions(provider,external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS usage_records_user_created_idx ON usage_records(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS user_memory_user_updated_idx ON user_memory(user_id,updated_at DESC);
