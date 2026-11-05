-- Retain only the 9Router gateway and the optional local Ollama runtime.
-- Historical usage, audit, conversations and messages are intentionally preserved.
BEGIN;

-- Remove retired provider model references from routing combinations.
DELETE FROM routing_combos combo
WHERE NOT EXISTS (
  SELECT 1 FROM unnest(combo.model_ids) AS model_id
  WHERE model_id LIKE '9router::%' OR model_id LIKE 'ollama::%'
);

UPDATE routing_combos combo
SET model_ids = ARRAY(
  SELECT model_id
  FROM unnest(combo.model_ids) WITH ORDINALITY AS item(model_id, ordinal)
  WHERE model_id LIKE '9router::%' OR model_id LIKE 'ollama::%'
  ORDER BY ordinal
), updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM unnest(combo.model_ids) AS model_id
  WHERE model_id NOT LIKE '9router::%' AND model_id NOT LIKE 'ollama::%'
);

-- Keep only supported providers in automatic fallback chains.
UPDATE provider_fallback_chains chain
SET ordered_models = COALESCE((
  SELECT jsonb_agg(to_jsonb(item.model_id) ORDER BY item.ordinal)
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(chain.ordered_models)='array' THEN chain.ordered_models ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS item(model_id, ordinal)
  WHERE item.model_id LIKE '9router::%' OR item.model_id LIKE 'ollama::%'
), '[]'::jsonb),
updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(chain.ordered_models)='array' THEN chain.ordered_models ELSE '[]'::jsonb END
  ) AS item(model_id)
  WHERE item.model_id NOT LIKE '9router::%' AND item.model_id NOT LIKE 'ollama::%'
);

-- Clear defaults that point at retired providers without touching chat history.
UPDATE users SET default_model=NULL, updated_at=now()
WHERE default_model IS NOT NULL
  AND default_model NOT LIKE '9router::%' AND default_model NOT LIKE 'ollama::%';
UPDATE user_preferences SET default_model=NULL
WHERE default_model IS NOT NULL
  AND default_model NOT LIKE '9router::%' AND default_model NOT LIKE 'ollama::%';
UPDATE user_settings SET default_model=NULL, updated_at=now()
WHERE default_model IS NOT NULL
  AND default_model NOT LIKE '9router::%' AND default_model NOT LIKE 'ollama::%';

DELETE FROM model_catalog WHERE provider_key NOT IN ('9router','ollama');
DELETE FROM provider_configs WHERE provider_key NOT IN ('9router','ollama');

-- Deleting provider rows also deletes their encrypted provider_keys through the FK cascade.
DELETE FROM providers WHERE slug NOT IN ('9router','ollama');

-- Ensure the 9Router control-plane row exists; its endpoint/key remain environment-managed.
INSERT INTO providers(kind,display_name,enabled,slug,base_url,config_json,source)
VALUES('openai_compat','9Router Gateway',true,'9router',NULL,'{"transport":"openai-compatible","managed_by":"environment"}'::jsonb,'system')
ON CONFLICT(slug) DO UPDATE SET
  display_name=EXCLUDED.display_name,
  kind=EXCLUDED.kind,
  config_json=EXCLUDED.config_json,
  updated_at=now();

COMMIT;
