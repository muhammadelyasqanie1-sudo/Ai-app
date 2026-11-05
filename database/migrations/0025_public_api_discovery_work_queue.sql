-- Durable bounded work queue for per-entry Public API discovery.
-- Claims expire automatically so interrupted admin sessions do not strand catalogue entries.
-- Backfill every catalogue row that existed before migration 0024 was installed.
INSERT INTO public_api_implementation_tracking(
  source_key,discovery_status,official_docs_url,last_discovered_at,created_at,updated_at
)
SELECT source_key,'catalogued',docs_url,now(),now(),now()
FROM public_api_catalog
ON CONFLICT(source_key) DO NOTHING;

ALTER TABLE public_api_implementation_tracking
  ADD COLUMN IF NOT EXISTS work_state text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_work_error text;

ALTER TABLE public_api_implementation_tracking
  DROP CONSTRAINT IF EXISTS public_api_implementation_work_state_check;
ALTER TABLE public_api_implementation_tracking
  ADD CONSTRAINT public_api_implementation_work_state_check
  CHECK (work_state IN ('queued','claimed','done','blocked'));

CREATE INDEX IF NOT EXISTS public_api_implementation_work_queue_idx
  ON public_api_implementation_tracking(work_state,lease_until,updated_at)
  WHERE work_state IN ('queued','claimed');

-- Existing entries are queued automatically; future imports already create tracking rows
-- with the default queued state.
UPDATE public_api_implementation_tracking
SET work_state='queued',updated_at=now()
WHERE work_state IS NULL OR work_state NOT IN ('queued','claimed','done','blocked');
