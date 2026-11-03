-- AFG AI admin roles, operational telemetry, and announcement storage.
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS health_checked_at timestamptz;
INSERT INTO roles(name,permissions_json) VALUES
 ('superadmin','{"*":true,"provider_keys:manage":true,"users:delete":true}'::jsonb)
ON CONFLICT(name) DO UPDATE SET permissions_json=EXCLUDED.permissions_json;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('user','admin','superadmin'));

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_json jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_json jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  model_id text,
  provider_key text,
  error_code varchar(64) NOT NULL,
  error_class text NOT NULL CHECK(error_class IN ('network','auth','rate_limit','provider_5xx','invalid_request','content_policy','timeout','unavailable','unknown')),
  message_redacted text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_logs_created_idx ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_class_created_idx ON error_logs(error_class,created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_model_created_idx ON error_logs(model_id,created_at DESC);

ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS provider_key text;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS model_key text;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success'
  CHECK(status IN ('success','error','timeout'));
CREATE INDEX IF NOT EXISTS usage_records_request_idx ON usage_records(request_id);
CREATE INDEX IF NOT EXISTS usage_records_provider_created_idx ON usage_records(provider_key,created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(120) NOT NULL,
  body varchar(2000) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_active_idx ON announcements(enabled,starts_at,expires_at);

-- Provider-scoped throttle policy defaults. Admin endpoint enforces a 100/minute cap per actor.
INSERT INTO rate_limit_policies(scope_type,scope_key,requests,window_seconds,enabled)
VALUES('admin','*',100,60,true)
ON CONFLICT(scope_type,scope_key) DO UPDATE SET requests=100,window_seconds=60,enabled=true,updated_at=now();
