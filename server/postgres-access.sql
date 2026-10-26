-- Run explicitly as the schema owner after both schema migrations.
-- Credentials are provisioned separately; an existing role/password is preserved.
BEGIN;
DO $access$
DECLARE item record; denied_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fhdod_api') THEN
    CREATE ROLE fhdod_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;

  REVOKE ALL ON SCHEMA fhdod FROM PUBLIC;
  REVOKE ALL ON ALL TABLES IN SCHEMA fhdod FROM PUBLIC;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA fhdod FROM PUBLIC;
  FOR denied_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA fhdod FROM %I', denied_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA fhdod FROM %I', denied_role);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA fhdod FROM %I', denied_role);
  END LOOP;

  GRANT USAGE ON SCHEMA fhdod TO fhdod_api;
  GRANT USAGE ON SEQUENCE fhdod.questions_position_seq TO fhdod_api;
  -- Explicit current tables only: no ownership, schema CREATE, grant option,
  -- schema_version access or automatic access to future tables.
  FOR item IN SELECT * FROM (VALUES
    ('questions', 'SELECT, INSERT, UPDATE'),
    ('question_versions', 'SELECT, INSERT'),
    ('surveys', 'SELECT, INSERT'),
    ('survey_sectors', 'SELECT, INSERT'),
    ('answers', 'SELECT, INSERT'),
    ('users', 'SELECT, INSERT, UPDATE'),
    ('sessions', 'SELECT, INSERT, UPDATE, DELETE'),
    ('question_audit', 'INSERT'),
    ('account_audit', 'INSERT'),
    ('survey_settings_versions', 'SELECT, INSERT'),
    ('contact_requests', 'SELECT, INSERT, UPDATE'),
    ('contact_status_audit', 'INSERT'),
    ('rate_limits', 'SELECT, INSERT, UPDATE, DELETE'),
    ('shift_schedules', 'SELECT, INSERT, UPDATE'),
    ('schedule_audit', 'INSERT')
  ) AS required_access(table_name, privileges) LOOP
    EXECUTE format('ALTER TABLE fhdod.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('GRANT %s ON TABLE fhdod.%I TO fhdod_api', item.privileges, item.table_name);
    -- Leave existing policies untouched, including any stricter operator policy.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'fhdod'
        AND tablename = item.table_name AND policyname = 'api_backend'
    ) THEN
      EXECUTE format(
        'CREATE POLICY api_backend ON fhdod.%I FOR ALL TO fhdod_api USING (true) WITH CHECK (true)',
        item.table_name
      );
    END IF;
  END LOOP;
END $access$;
COMMIT;
