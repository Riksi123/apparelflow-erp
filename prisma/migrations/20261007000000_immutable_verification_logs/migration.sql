CREATE FUNCTION prevent_verification_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_logs_immutable
BEFORE UPDATE OR DELETE ON verification_logs
FOR EACH ROW EXECUTE FUNCTION prevent_verification_log_mutation();
