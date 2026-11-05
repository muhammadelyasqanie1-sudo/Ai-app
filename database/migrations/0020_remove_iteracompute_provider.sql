-- Permanently retire IteraCompute from AFG AI.
-- Keep historical usage/conversation records, but remove active provider credentials,
-- model inventory, defaults, and routing references so no new request can select it.

-- Remove IteraCompute-only routing combos first to satisfy the non-empty model_ids constraint.
DELETE FROM routing_combos AS combo
WHERE EXISTS (
  SELECT 1 FROM unnest(combo.model_ids) AS model_id
  WHERE model_id LIKE 'iteracompute::%'
)
AND NOT EXISTS (
  SELECT 1 FROM unnest(combo.model_ids) AS model_id
  WHERE model_id NOT LIKE 'iteracompute::%'
);

-- Remove retired models from mixed routing combos.
UPDATE routing_combos AS combo
SET model_ids = ARRAY(
  SELECT model_id
  FROM unnest(combo.model_ids) WITH ORDINALITY AS entry(model_id, ordinality)
  WHERE model_id NOT LIKE 'iteracompute::%'
  ORDER BY ordinality
), updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM unnest(combo.model_ids) AS model_id
  WHERE model_id LIKE 'iteracompute::%'
);

-- Remove retired models from automatic fallback chains.
UPDATE provider_fallback_chains AS chain
SET ordered_models = COALESCE((
  SELECT jsonb_agg(to_jsonb(entry.model_id) ORDER BY entry.ordinality)
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(chain.ordered_models) = 'array' THEN chain.ordered_models ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS entry(model_id, ordinality)
  WHERE entry.model_id NOT LIKE 'iteracompute::%'
), '[]'::jsonb),
updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(chain.ordered_models) = 'array' THEN chain.ordered_models ELSE '[]'::jsonb END
  ) AS entry(model_id)
  WHERE entry.model_id LIKE 'iteracompute::%'
);

-- Clear active user defaults; historical messages and usage records remain intact.
UPDATE users
SET default_model = NULL, updated_at = now()
WHERE default_model LIKE 'iteracompute::%';

UPDATE user_preferences
SET default_model = NULL
WHERE default_model LIKE 'iteracompute::%';

UPDATE user_settings
SET default_model = NULL, updated_at = now()
WHERE default_model LIKE 'iteracompute::%';

-- Remove both modern and legacy catalogue rows and provider credentials/configuration.
DELETE FROM model_catalog WHERE provider_key = 'iteracompute';
DELETE FROM provider_configs WHERE provider_key = 'iteracompute';
DELETE FROM providers
WHERE slug = 'iteracompute'
   OR kind = 'iteracompute';
