-- Make authenticated message appends safe to retry after network interruptions.
-- NULL values preserve compatibility with older clients that do not send an idempotency key.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_message_id_uidx
  ON messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
