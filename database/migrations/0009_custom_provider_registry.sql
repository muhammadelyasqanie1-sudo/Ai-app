-- Metadata for custom OpenAI-compatible providers. Credentials and sensitive headers
-- remain inside the AES-256-GCM encrypted config_encrypted envelope.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS api_format text NOT NULL DEFAULT 'openai_chat_completions';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'bearer';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS request_timeout_ms integer NOT NULL DEFAULT 30000;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS streaming_supported boolean NOT NULL DEFAULT true;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS providers_enabled_priority_idx
  ON providers(enabled,priority,display_name);

ALTER TABLE providers ADD CONSTRAINT providers_api_format_check
  CHECK(api_format IN ('openai_chat_completions')) NOT VALID;
ALTER TABLE providers ADD CONSTRAINT providers_auth_method_check
  CHECK(auth_method IN ('bearer','api-key-header','none')) NOT VALID;
ALTER TABLE providers ADD CONSTRAINT providers_timeout_check
  CHECK(request_timeout_ms BETWEEN 1000 AND 180000) NOT VALID;
