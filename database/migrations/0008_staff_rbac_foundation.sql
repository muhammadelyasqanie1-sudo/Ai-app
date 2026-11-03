-- Additive staff RBAC foundation. Existing users keep their current role.
INSERT INTO roles(name,permissions_json) VALUES
  ('super_admin','{"*":true}'::jsonb),
  ('provider_manager','{"providers:read":true,"providers:manage":true,"system:read":true}'::jsonb),
  ('model_manager','{"providers:read":true,"models:read":true,"models:manage":true,"routing:read":true,"routing:manage":true,"system:read":true}'::jsonb),
  ('support_staff','{"users:read":true,"audit:read":true}'::jsonb),
  ('moderator','{"users:read":true,"users:suspend":true,"audit:read":true,"security:read":true}'::jsonb),
  ('analyst','{"dashboard:read":true,"usage:read":true,"system:read":true,"audit:read":true}'::jsonb),
  ('read_only_staff','{"dashboard:read":true,"users:read":true,"providers:read":true,"models:read":true,"routing:read":true,"subscriptions:read":true,"usage:read":true,"audit:read":true,"security:read":true,"system:read":true,"settings:read":true}'::jsonb)
ON CONFLICT(name) DO UPDATE SET permissions_json=EXCLUDED.permissions_json;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK(role IN ('user','admin','super_admin','provider_manager','model_manager','support_staff','moderator','analyst','read_only_staff'));

CREATE INDEX IF NOT EXISTS users_role_status_idx ON users(role,status);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON audit_logs(actor_user_id,created_at DESC);
