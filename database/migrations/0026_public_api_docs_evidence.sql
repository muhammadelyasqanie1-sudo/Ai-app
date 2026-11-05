-- Store protocol/auth/documentation evidence discovered from the catalogue's official site.
-- Evidence is descriptive only; it never verifies an endpoint or enables a connector.
ALTER TABLE public_api_implementation_tracking
  ADD COLUMN IF NOT EXISTS docs_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS protocol_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auth_evidence text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS public_api_implementation_protocol_idx
  ON public_api_implementation_tracking USING gin(protocol_types);
