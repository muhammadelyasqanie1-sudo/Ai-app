-- 9Router request observability: metadata only, never prompts, bodies or credentials.
CREATE TABLE IF NOT EXISTS ninerouter_request_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 160),
  http_method text NOT NULL CHECK (http_method ~ '^[A-Z]{3,10}$'),
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  outcome text NOT NULL CHECK (outcome IN ('success','client_error','upstream_error','gateway_error')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ninerouter_request_logs_created_idx
  ON ninerouter_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ninerouter_request_logs_user_created_idx
  ON ninerouter_request_logs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ninerouter_request_logs_endpoint_created_idx
  ON ninerouter_request_logs(endpoint,created_at DESC);
