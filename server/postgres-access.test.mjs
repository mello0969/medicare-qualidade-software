import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Postgres access setup is repeatable, preserves credentials and isolates the backend from public roles', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const sql = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
  await db.exec(sql('./postgres-schema.sql'));
  await db.exec(sql('./schedules-schema.sql'));
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE public_probe;
    GRANT USAGE, CREATE ON SCHEMA fhdod TO PUBLIC, anon, authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA fhdod TO PUBLIC, anon, authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA fhdod TO PUBLIC, anon, authenticated;
    INSERT INTO fhdod.surveys (id,created_at,payload_hash,nps,comment,shift,doctor)
      VALUES ('qa','2026-10-26T12:00:00.000Z','synthetic',0,'Private test','manha','');
    INSERT INTO fhdod.users VALUES
      ('qa-admin','QA','qa@example.test','manager',NULL,'synthetic','synthetic','now',0);
  `);
  const access = sql('./postgres-access.sql');
  await db.exec(access);
  assert.deepEqual(
    (
      await db.query(
        "SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='fhdod_api'",
      )
    ).rows[0],
    {
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    },
  );
  await db.exec("ALTER ROLE fhdod_api LOGIN PASSWORD 'qa-only-temporary-password'");
  const credential = async () =>
    (await db.query("SELECT rolcanlogin,rolpassword FROM pg_authid WHERE rolname='fhdod_api'"))
      .rows[0];
  const before = await credential();
  await db.exec(access);
  assert.deepEqual(await credential(), before);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='fhdod' AND policyname='api_backend'",
      )
    ).rows[0].count,
    15,
  );
  await db.exec('SET ROLE fhdod_api');
  try {
    assert.equal((await db.query('SELECT nps FROM fhdod.surveys')).rows[0].nps, 0);
    await db.exec(
      "INSERT INTO fhdod.questions (id,sector_id,current_version) VALUES ('qa-question','recepcao',1)",
    );
    await db.exec(
      "INSERT INTO fhdod.shift_schedules VALUES ('recepcao','2026-10-26','manha','Test team',1,'now','qa-admin')",
    );
    assert.equal(
      (await db.query('SELECT team FROM fhdod.shift_schedules')).rows[0].team,
      'Test team',
    );
    await assert.rejects(db.query('DELETE FROM fhdod.surveys'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM fhdod.schema_version'), /permission denied/);
    await assert.rejects(db.query('CREATE TABLE fhdod.forbidden (id int)'), /permission denied/);
  } finally {
    await db.exec('RESET ROLE');
  }
  for (const role of ['anon', 'authenticated', 'public_probe']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query('SELECT * FROM fhdod.surveys'), /permission denied/);
    } finally {
      await db.exec('RESET ROLE');
    }
  }
});
