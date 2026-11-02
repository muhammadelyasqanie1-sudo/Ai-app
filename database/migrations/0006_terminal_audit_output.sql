ALTER TABLE terminal_audit
  ADD COLUMN IF NOT EXISTS output_text text NOT NULL DEFAULT '';
ALTER TABLE terminal_audit
  ADD CONSTRAINT terminal_audit_output_size_check
  CHECK (octet_length(output_text) <= 262144);

CREATE OR REPLACE FUNCTION afg_terminal_audit_no_mutation() RETURNS trigger AS $afg$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'terminal_audit is append-only';
  END IF;
  IF NEW.command IS DISTINCT FROM OLD.command
     OR NEW.output_text IS DISTINCT FROM OLD.output_text
     OR NEW.exit_code IS DISTINCT FROM OLD.exit_code
     OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'terminal audit event content is immutable';
  END IF;
  RETURN NEW;
END;
$afg$ LANGUAGE plpgsql;
