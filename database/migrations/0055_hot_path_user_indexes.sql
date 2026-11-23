-- 0055: Add missing indexes on hot user-scoped legacy tables (Master Mission 2B audit).
-- All six tables are queried by user_id on hot paths (admin usage rollups, chat memory
-- lookup, email code verification, productivity/notifications/assets listing) but were
-- created in 0000 without any secondary indexes. Additive only; safe to re-run.
-- Note: plain CREATE INDEX (not CONCURRENTLY) because the migration runner executes each
-- file inside a transaction. Table sizes are modest; for very large deployments run the
-- equivalent CREATE INDEX CONCURRENTLY manually during a maintenance window.

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider_created ON usage_events(provider_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_assets_user_created ON generated_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_codes_user_purpose ON email_verification_codes(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_email_codes_expiry ON email_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_category ON user_memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_productivity_items_user_updated ON productivity_items(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notification_events_user_created ON user_notification_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notification_events_unread ON user_notification_events(user_id, read_at) WHERE read_at IS NULL;
