-- Durable idempotency records for the authenticated Personal AI Gateway.
-- Conversation/message ownership remains enforced by the existing tables and API.
CREATE TABLE IF NOT EXISTS personal_gateway_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_message_id uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  assistant_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  response_text text,
  provider_key text,
  model_key text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS personal_gateway_requests_conversation_idx
  ON personal_gateway_requests(user_id, conversation_id, created_at DESC);
