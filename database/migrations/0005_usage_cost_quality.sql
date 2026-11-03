-- Cost and token telemetry must distinguish unknown pricing from a zero-cost call.
ALTER TABLE usage_records ALTER COLUMN cost_usd DROP NOT NULL;
ALTER TABLE usage_records ALTER COLUMN cost_usd DROP DEFAULT;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS token_count_source text NOT NULL DEFAULT 'estimated'
  CHECK(token_count_source IN ('provider','estimated','unknown'));
