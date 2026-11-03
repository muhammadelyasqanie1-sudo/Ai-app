-- Normalize legacy Workers AI catalog rows to the seeded `cloudflare` slug.
-- This migration is additive: it preserves legacy rows for rollback/audit, while
-- copying their enablement and newest health result into the canonical inventory.
UPDATE model_catalog canonical
SET enabled = canonical.enabled OR legacy.enabled,
    verified_at = CASE
      WHEN legacy.verified_at IS NOT NULL AND (canonical.verified_at IS NULL OR legacy.verified_at > canonical.verified_at)
        THEN legacy.verified_at ELSE canonical.verified_at END,
    health_checked_at = CASE
      WHEN legacy.health_checked_at IS NOT NULL AND (canonical.health_checked_at IS NULL OR legacy.health_checked_at > canonical.health_checked_at)
        THEN legacy.health_checked_at ELSE canonical.health_checked_at END,
    last_health_ok = CASE
      WHEN legacy.health_checked_at IS NOT NULL AND (canonical.health_checked_at IS NULL OR legacy.health_checked_at > canonical.health_checked_at)
        THEN legacy.last_health_ok ELSE canonical.last_health_ok END,
    updated_at = now()
FROM model_catalog legacy
WHERE canonical.provider_key='cloudflare'
  AND legacy.provider_key='cloudflare-workers-ai'
  AND canonical.model_key=legacy.model_key;

INSERT INTO model_catalog(provider_key,model_key,display_name,description,capabilities,enabled,context_window,
  verified_at,health_checked_at,last_health_ok,discovered_at,max_output,pricing_json,input_cost_per_million,output_cost_per_million)
SELECT 'cloudflare',legacy.model_key,legacy.display_name,legacy.description,legacy.capabilities,legacy.enabled,
  legacy.context_window,legacy.verified_at,legacy.health_checked_at,legacy.last_health_ok,legacy.discovered_at,
  legacy.max_output,legacy.pricing_json,legacy.input_cost_per_million,legacy.output_cost_per_million
FROM model_catalog legacy
WHERE legacy.provider_key='cloudflare-workers-ai'
  AND NOT EXISTS (SELECT 1 FROM model_catalog canonical
                  WHERE canonical.provider_key='cloudflare' AND canonical.model_key=legacy.model_key)
ON CONFLICT(provider_key,model_key) DO NOTHING;

-- Preserve the previously configured Workers AI state when switching to the canonical slug.
UPDATE providers canonical
SET enabled = canonical.enabled OR legacy.enabled,
    last_health_at = CASE
      WHEN legacy.last_health_at IS NOT NULL AND (canonical.last_health_at IS NULL OR legacy.last_health_at > canonical.last_health_at)
        THEN legacy.last_health_at ELSE canonical.last_health_at END,
    last_health_ok = CASE
      WHEN legacy.last_health_at IS NOT NULL AND (canonical.last_health_at IS NULL OR legacy.last_health_at > canonical.last_health_at)
        THEN legacy.last_health_ok ELSE canonical.last_health_ok END,
    updated_at = now()
FROM providers legacy
WHERE canonical.slug = 'cloudflare'
  AND legacy.slug = 'cloudflare-workers-ai';

-- Also preserve the legacy provider-config toggle if the old provider row is absent.
UPDATE providers canonical
SET enabled = canonical.enabled OR EXISTS (
  SELECT 1 FROM provider_configs legacy
  WHERE legacy.provider_key = 'cloudflare-workers-ai' AND legacy.enabled = true
), updated_at = now()
WHERE canonical.slug = 'cloudflare';

INSERT INTO provider_configs(provider_key,display_name,enabled)
SELECT 'cloudflare',display_name,enabled
FROM provider_configs WHERE provider_key='cloudflare-workers-ai'
ON CONFLICT(provider_key) DO UPDATE
SET enabled=EXCLUDED.enabled,display_name=EXCLUDED.display_name,updated_at=now();
