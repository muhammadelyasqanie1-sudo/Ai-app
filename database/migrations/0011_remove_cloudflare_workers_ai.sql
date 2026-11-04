-- Remove Cloudflare Workers AI as an AFG AI inference provider.
-- Cloudflare R2/KV infrastructure is separate and remains untouched.

-- Remove legacy/canonical Workers AI model IDs from automatic fallback chains.
UPDATE provider_fallback_chains AS chain
SET ordered_models = COALESCE((
  SELECT jsonb_agg(to_jsonb(entry.model_id) ORDER BY entry.ordinality)
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(chain.ordered_models) = 'array' THEN chain.ordered_models ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS entry(model_id, ordinality)
  WHERE entry.model_id NOT LIKE 'cloudflare::%'
    AND entry.model_id NOT LIKE 'cloudflare-workers-ai::%'
), '[]'::jsonb),
updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(chain.ordered_models) = 'array' THEN chain.ordered_models ELSE '[]'::jsonb END
  ) AS entry(model_id)
  WHERE entry.model_id LIKE 'cloudflare::%'
     OR entry.model_id LIKE 'cloudflare-workers-ai::%'
);

-- Clear user defaults that point to a provider being removed; auto-selection can take over.
UPDATE users
SET default_model = NULL, updated_at = now()
WHERE default_model LIKE 'cloudflare::%'
   OR default_model LIKE 'cloudflare-workers-ai::%';

UPDATE user_preferences
SET default_model = NULL
WHERE default_model LIKE 'cloudflare::%'
   OR default_model LIKE 'cloudflare-workers-ai::%';

-- Historical usage/audit rows are intentionally retained.
DELETE FROM model_catalog
WHERE provider_key IN ('cloudflare', 'cloudflare-workers-ai');

DELETE FROM provider_configs
WHERE provider_key IN ('cloudflare', 'cloudflare-workers-ai');

DELETE FROM providers
WHERE slug IN ('cloudflare', 'cloudflare-workers-ai')
   OR kind = 'cloudflare';
