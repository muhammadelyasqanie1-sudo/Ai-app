-- Preserve cancellation separately from successful and failed completions.
-- Existing rows and foreign keys remain intact.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('pending', 'complete', 'failed', 'cancelled'));
CREATE INDEX IF NOT EXISTS messages_conversation_order_idx ON messages(conversation_id, created_at, id);
