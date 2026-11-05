-- Track the implementation lifecycle of every Public APIs catalogue entry.
-- This is global documentation/verification metadata; user credentials remain owner-scoped
-- in user_api_connectors and are never copied into this table.
ALTER TABLE public_api_sync_state
  ADD COLUMN IF NOT EXISTS repository_readme_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS directory_api_ok boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public_api_implementation_tracking (
  source_key text PRIMARY KEY,
  discovery_status text NOT NULL DEFAULT 'catalogued',
  official_docs_url text,
  openapi_spec_url text,
  endpoint_url text,
  http_method text,
  auth_type text,
  contract jsonb,
  endpoint_verified boolean NOT NULL DEFAULT false,
  auth_configured boolean NOT NULL DEFAULT false,
  last_probe_at timestamptz,
  last_probe_status text,
  unsupported_reason text,
  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_api_implementation_status_check CHECK (
    discovery_status IN (
      'catalogued','docs_discovered','contract_discovered','endpoint_verified',
      'auth_configured','probe_passed','enabled','waiting','unsupported'
    )
  ),
  CONSTRAINT public_api_implementation_method_check CHECK (
    http_method IS NULL OR http_method IN ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS')
  )
);

CREATE INDEX IF NOT EXISTS public_api_implementation_status_idx
  ON public_api_implementation_tracking(discovery_status,updated_at);

CREATE INDEX IF NOT EXISTS public_api_implementation_probe_idx
  ON public_api_implementation_tracking(last_probe_status,last_probe_at);
