-- Usage accounting may now record provider-reported token counts.
-- Widens the 0005 CHECK constraint on usage_records.token_count_source to accept
-- the new 'reported' value alongside the existing 'provider','estimated','unknown'.
-- Additive and idempotent: the old (auto-named) CHECK is dropped only if present
-- and re-created with the widened value list.
DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('usage_records') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('usage_records')
      AND attname = 'token_count_source'
      AND NOT attisdropped
  ) THEN
    RETURN;
  END IF;
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid = to_regclass('usage_records')
      AND pg_get_constraintdef(pg_constraint.oid) LIKE '%token_count_source%'
  LOOP
    EXECUTE format('ALTER TABLE usage_records DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  ALTER TABLE usage_records
    ADD CONSTRAINT usage_records_token_count_source_check
    CHECK (token_count_source IN ('provider','estimated','unknown','reported'));
END $$;
