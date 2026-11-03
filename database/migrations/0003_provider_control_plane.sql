-- AFG AI provider control-plane catalog (additive; keeps legacy provider_configs intact).
-- Provider kinds are categories, not identities: multiple custom providers must be allowed.
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_kind_key;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS base_url text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system'
  CHECK (source IN ('system','custom'));
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_error_code text;
-- Backfill stable URLs for pre-existing legacy provider rows before adding the slug constraint.
UPDATE providers p
SET slug=lower(regexp_replace(p.kind,'[^a-zA-Z0-9-]+','-','g'))
WHERE p.slug IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM providers other
    WHERE other.slug=lower(regexp_replace(p.kind,'[^a-zA-Z0-9-]+','-','g'))
  );
UPDATE providers p
SET slug=lower(regexp_replace(p.kind,'[^a-zA-Z0-9-]+','-','g'))||'-'||left(p.id::text,8)
WHERE p.slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS providers_slug_unique_idx ON providers(slug);

CREATE TABLE IF NOT EXISTS provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  alias varchar(64) NOT NULL DEFAULT 'default',
  key_encrypted text NOT NULL,
  key_hint varchar(8) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','invalid','expired')),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE(provider_id,alias)
);
CREATE INDEX IF NOT EXISTS provider_keys_provider_status_idx ON provider_keys(provider_id,status);

-- Model metadata used by admin inventory. Never mark a seeded model verified.
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS max_output integer;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS pricing_json jsonb;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS discovered_at timestamptz;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS last_health_ok boolean;

-- Seed the built-in providers idempotently. Cloudflare uses the platform AI binding;
-- Ollama is desktop/local only and is not assumed reachable from the hosted server.
INSERT INTO providers(kind,display_name,enabled,slug,base_url,config_json,source)
VALUES
 ('cloudflare','Cloudflare Workers AI',false,'cloudflare',NULL,'{"transport":"workers-ai-binding","requires_key":false}'::jsonb,'system'),
 ('openai_compat','DeepSeek',false,'deepseek','https://api.deepseek.com/v1','{"protocol":"openai-compatible","requires_key":true}'::jsonb,'system'),
 ('openai_compat','OpenAI',false,'openai','https://api.openai.com/v1','{"protocol":"openai-compatible","requires_key":true}'::jsonb,'system'),
 ('anthropic','Anthropic',false,'anthropic','https://api.anthropic.com','{"protocol":"anthropic-messages","requires_key":true}'::jsonb,'system'),
 ('openai_compat','Google Gemini',false,'google','https://generativelanguage.googleapis.com/v1beta/openai','{"protocol":"openai-compatible","requires_key":true}'::jsonb,'system'),
 ('openai_compat','OpenRouter',false,'openrouter','https://openrouter.ai/api/v1','{"protocol":"openai-compatible","requires_key":true}'::jsonb,'system'),
 ('ollama','Ollama (Local)',false,'ollama','http://127.0.0.1:11434','{"protocol":"ollama","requires_key":false,"deployment":"desktop-only"}'::jsonb,'system')
ON CONFLICT(slug) DO UPDATE SET
 display_name=EXCLUDED.display_name,base_url=EXCLUDED.base_url,
 config_json=EXCLUDED.config_json,updated_at=now();

-- Official DeepSeek IDs requested for the initial inventory. These are catalog entries,
-- not claims that the account can access them; they remain disabled and unverified.
INSERT INTO model_catalog(provider_key,model_key,display_name,capabilities,enabled,context_window)
VALUES
 ('deepseek','deepseek-v4-pro','DeepSeek V4 Pro',ARRAY['text','streaming'],false,0),
 ('deepseek','deepseek-v4-flash','DeepSeek V4 Flash',ARRAY['text','streaming'],false,0),
 ('deepseek','deepseek-v4-flash-vision-exp','DeepSeek V4 Flash Vision Experimental',ARRAY['text','vision','streaming'],false,0),
 ('deepseek','deepseek-chat','DeepSeek Chat',ARRAY['text','streaming'],false,0),
 ('deepseek','deepseek-reasoner','DeepSeek Reasoner',ARRAY['text','streaming'],false,0)
ON CONFLICT(provider_key,model_key) DO NOTHING;

-- Audit is append-only for the application role. Table owner/migration role retains DDL authority.
CREATE OR REPLACE FUNCTION afg_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_update_delete
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION afg_reject_audit_mutation();
