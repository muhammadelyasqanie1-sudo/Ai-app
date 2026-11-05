-- Separate discovery catalogue for LLM inference APIs.
-- Catalogue records are informational candidates only; they do not create provider
-- credentials, enable providers, or make an inference request.
CREATE TABLE IF NOT EXISTS llm_api_catalog (
  source_key text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('mnfst/awesome-free-llm-apis','open-free-llm-api/awesome-freellm-apis')),
  provider_slug text NOT NULL,
  provider_name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'inference_provider'
    CHECK (provider_type IN ('provider_api','inference_provider','unknown')),
  base_url text,
  api_key_url text,
  provider_url text,
  description text NOT NULL DEFAULT '',
  free_tier_type text NOT NULL DEFAULT 'unknown'
    CHECK (free_tier_type IN ('permanent','renewable','trial','promotional','unknown')),
  payment_requirement text NOT NULL DEFAULT 'unknown'
    CHECK (payment_requirement IN ('no_card','card','phone_verification','registration','unknown')),
  free_tier_details text NOT NULL DEFAULT '',
  model_id text,
  model_name text,
  model_page_url text,
  context_window integer CHECK (context_window IS NULL OR context_window BETWEEN 0 AND 10000000),
  max_output_tokens integer CHECK (max_output_tokens IS NULL OR max_output_tokens BETWEEN 0 AND 10000000),
  modalities text[] NOT NULL DEFAULT ARRAY[]::text[],
  rate_limit text,
  source_updated_at date,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_status text NOT NULL DEFAULT 'candidate'
    CHECK (eligibility_status IN ('candidate','verified','blocked','retired')),
  review_note text,
  is_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_api_catalog_provider_model_idx
  ON llm_api_catalog(provider_slug, model_name);
CREATE INDEX IF NOT EXISTS llm_api_catalog_filters_idx
  ON llm_api_catalog(source, free_tier_type, eligibility_status, is_active);
CREATE INDEX IF NOT EXISTS llm_api_catalog_name_idx
  ON llm_api_catalog(provider_name, model_name);

CREATE TABLE IF NOT EXISTS llm_api_sync_state (
  source text PRIMARY KEY,
  status text NOT NULL DEFAULT 'never'
    CHECK (status IN ('never','running','success','partial','error')),
  items_imported integer NOT NULL DEFAULT 0 CHECK (items_imported >= 0),
  providers_imported integer NOT NULL DEFAULT 0 CHECK (providers_imported >= 0),
  source_updated_at date,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO llm_api_sync_state(source,status)
VALUES
 ('mnfst/awesome-free-llm-apis','never'),
 ('open-free-llm-api/awesome-freellm-apis','never')
ON CONFLICT (source) DO NOTHING;
