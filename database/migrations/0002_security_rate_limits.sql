-- Default distributed abuse controls. Admin-configured policies can override these values.
INSERT INTO rate_limit_policies(scope_type,scope_key,requests,window_seconds,enabled)
VALUES
 ('ip','*',120,60,true),
 ('user','*',120,60,true),
 ('tier','free',60,60,true),
 ('tier','pro',300,60,true)
ON CONFLICT(scope_type,scope_key) DO NOTHING;

-- Default model ceiling for every discovered model; admins may tune individual entries.
INSERT INTO rate_limit_policies(scope_type,scope_key,requests,window_seconds,enabled)
SELECT 'model',provider_key||'::'||model_key,60,60,true
FROM model_catalog
ON CONFLICT(scope_type,scope_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx ON rate_limit_counters(window_start);
CREATE INDEX IF NOT EXISTS sessions_user_revoked_idx ON sessions(user_id,revoked_at) WHERE revoked_at IS NULL;
