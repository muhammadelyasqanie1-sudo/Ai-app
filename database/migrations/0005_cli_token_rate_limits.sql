-- Per-token CLI request buckets. One row per token per UTC hour.
CREATE TABLE IF NOT EXISTS cli_token_rate_limits (
  token_id uuid NOT NULL REFERENCES cli_tokens(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY(token_id,bucket_start)
);
CREATE INDEX IF NOT EXISTS cli_token_rate_limits_bucket_idx ON cli_token_rate_limits(bucket_start);
