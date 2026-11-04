-- Universal Public APIs directory cache. The imported catalog is metadata only:
-- entries are never executed automatically and may link to documentation pages.
CREATE TABLE IF NOT EXISTS public_api_catalog (
  source_key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  auth text NOT NULL DEFAULT 'Unknown',
  https text NOT NULL DEFAULT 'Unknown',
  cors text NOT NULL DEFAULT 'Unknown',
  category text NOT NULL DEFAULT 'Uncategorized',
  homepage_url text,
  docs_url text,
  health_status text NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('unknown','online','slow','offline','error')),
  response_time_ms integer CHECK (response_time_ms IS NULL OR response_time_ms BETWEEN 0 AND 600000),
  last_health_check timestamptz,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_api_catalog_category_name_idx
  ON public_api_catalog(category, name);
CREATE INDEX IF NOT EXISTS public_api_catalog_filters_idx
  ON public_api_catalog(auth, https, cors, is_active);
CREATE INDEX IF NOT EXISTS public_api_catalog_imported_idx
  ON public_api_catalog(imported_at DESC);

CREATE TABLE IF NOT EXISTS public_api_sync_state (
  source text PRIMARY KEY,
  status text NOT NULL DEFAULT 'never'
    CHECK (status IN ('never','running','success','partial','error')),
  items_imported integer NOT NULL DEFAULT 0 CHECK (items_imported >= 0),
  pages_fetched integer NOT NULL DEFAULT 0 CHECK (pages_fetched >= 0),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public_api_sync_state(source,status)
VALUES ('publicapis.lol','never')
ON CONFLICT (source) DO NOTHING;

-- 9Router is an optional OpenAI-compatible gateway configured only through
-- server environment variables. No API key or endpoint is seeded into the DB.
INSERT INTO providers(kind,display_name,enabled,slug,base_url,config_json,source)
VALUES ('openai_compat','9Router Gateway',true,'9router',NULL,
        '{"protocol":"openai-compatible","managedBy":"environment","requires_key":true}'::jsonb,
        'system')
ON CONFLICT (slug) DO NOTHING;
