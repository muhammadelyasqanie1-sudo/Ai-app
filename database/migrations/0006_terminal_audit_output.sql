ALTER TABLE terminal_audit
  ADD COLUMN IF NOT EXISTS output_text text NOT NULL DEFAULT '';
ALTER TABLE terminal_audit
  ADD CONSTRAINT terminal_audit_output_size_check
  CHECK (octet_length(output_text) <= 262144);
