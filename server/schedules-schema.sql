-- Incremental migration for the existing hosted database. Run explicitly before deployment.
ALTER TABLE fhdod.surveys ADD COLUMN IF NOT EXISTS attendance_date text;
ALTER TABLE fhdod.surveys ADD COLUMN IF NOT EXISTS teams_json text NOT NULL DEFAULT '[]';
ALTER TABLE fhdod.surveys DROP CONSTRAINT IF EXISTS surveys_shift_check;
ALTER TABLE fhdod.surveys ADD CONSTRAINT surveys_shift_check
  CHECK(shift IN ('par','impar','nao-informado','manha','tarde','noite'));
CREATE TABLE IF NOT EXISTS fhdod.shift_schedules (
  sector_id text NOT NULL,
  attendance_date text NOT NULL,
  shift text NOT NULL CHECK(shift IN ('manha','tarde','noite')),
  team text NOT NULL,
  version integer NOT NULL CHECK(version>0),
  updated_at text NOT NULL,
  updated_by text NOT NULL REFERENCES fhdod.users(id),
  PRIMARY KEY(sector_id,attendance_date,shift)
);
CREATE TABLE IF NOT EXISTS fhdod.schedule_audit (
  id text PRIMARY KEY,
  sector_id text NOT NULL,
  attendance_date text NOT NULL,
  shift text NOT NULL,
  user_id text NOT NULL REFERENCES fhdod.users(id),
  previous_version integer NOT NULL,
  next_version integer NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_month ON fhdod.shift_schedules(attendance_date,sector_id);
ALTER TABLE fhdod.shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhdod.schedule_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fhdod.shift_schedules,fhdod.schedule_audit FROM PUBLIC;
DO $security$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON fhdod.shift_schedules,fhdod.schedule_audit FROM %I',r);
  END LOOP;
END $security$;
INSERT INTO fhdod.schema_version VALUES (2) ON CONFLICT DO NOTHING;
