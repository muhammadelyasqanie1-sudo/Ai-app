-- AFG AI Terminal Foundation (Phase 1). Execution is intentionally not enabled.
CREATE TABLE IF NOT EXISTS cli_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  scopes text[] NOT NULL DEFAULT ARRAY['chat','terminal.read'],
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS cli_tokens_user_created_idx ON cli_tokens(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS cli_tokens_active_idx ON cli_tokens(token_hash,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('web','cli')),
  cli_token_id uuid REFERENCES cli_tokens(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS terminal_sessions_user_active_idx ON terminal_sessions(user_id,last_active_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS terminal_audit (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES terminal_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  command text NOT NULL,
  exit_code integer NOT NULL,
  duration_ms integer NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terminal_audit_session_created_idx ON terminal_audit(session_id,created_at DESC);
CREATE INDEX IF NOT EXISTS terminal_audit_user_created_idx ON terminal_audit(user_id,created_at DESC);

-- Database-enforced append-only audit records for the application role.
CREATE OR REPLACE FUNCTION afg_terminal_audit_no_mutation() RETURNS trigger AS $afg$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'terminal_audit is append-only';
  END IF;
  IF NEW.command IS DISTINCT FROM OLD.command
     OR NEW.exit_code IS DISTINCT FROM OLD.exit_code
     OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'terminal audit event content is immutable';
  END IF;
  -- Foreign-key cleanup may null the owner/session references; event content remains immutable.
  RETURN NEW;
END;
$afg$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS terminal_audit_no_update ON terminal_audit;
DROP TRIGGER IF EXISTS terminal_audit_no_delete ON terminal_audit;
CREATE TRIGGER terminal_audit_no_update BEFORE UPDATE ON terminal_audit
FOR EACH ROW EXECUTE FUNCTION afg_terminal_audit_no_mutation();
CREATE TRIGGER terminal_audit_no_delete BEFORE DELETE ON terminal_audit
FOR EACH ROW EXECUTE FUNCTION afg_terminal_audit_no_mutation();
