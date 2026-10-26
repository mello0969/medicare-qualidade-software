import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { DEFAULT_QUESTIONS } from '../src/domain.ts';
import { createPostgresRepository, postgresPoolOptions, postgresTransaction } from './postgres.mjs';
import { migratePostgres } from './migrate-postgres.mjs';
import { bootstrapPostgres } from './bootstrap-postgres.mjs';

// PGlite executes real PostgreSQL in WASM. Its single connection does not model
// production pool scheduling; transaction ownership is verified separately below.
async function fixture(t) {
  const db = new PGlite();
  const query = async (sql, params) =>
    params === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, params);
  let tail = Promise.resolve();
  const pool = {
    query,
    async connect() {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      return { query, release };
    },
    end: () => db.close(),
  };
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await migratePostgres(pool);
  const repo = createPostgresRepository({ pool });
  t.after(() => repo.close());
  const administrator = await repo.createUser({
    name: 'Admin de teste',
    email: 'admin@example.test',
    password: 'test-admin-password-2026',
    role: 'manager',
    sectorId: null,
  });
  return { db, pool, repo, administrator };
}
const sample = (overrides = {}) => ({
  id: randomUUID(),
  createdAt: '2020-01-01T00:00:00.000Z',
  sectorIds: ['recepcao'],
  answers: DEFAULT_QUESTIONS.filter((q) => q.sectorId === 'recepcao').map((q) => ({
    questionId: q.id,
    questionVersion: q.version,
    questionText: q.text,
    sectorId: q.sectorId,
    value: 2,
  })),
  nps: 0,
  comment: 'Comentário privado de teste',
  shift: 'par',
  doctor: '',
  ...overrides,
});
const at = '2026-10-25T12:00:00.000Z';

test('Postgres migration is repeatable, preserves questions, enables RLS and denies anonymous schema access', async (t) => {
  const { db, pool, repo, administrator } = await fixture(t);
  assert.deepEqual(await repo.listQuestions(), DEFAULT_QUESTIONS);
  const current = await repo.listQuestions();
  const changed = current.map((q, i) =>
    i ? q : { ...q, text: 'A recepção foi clara e atenciosa?', version: 2 },
  );
  await repo.updateQuestions(
    changed,
    Object.fromEntries(current.map((q) => [q.id, q.version])),
    administrator,
    at,
  );
  await migratePostgres(pool);
  assert.equal((await repo.listQuestions())[0].version, 2);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='fhdod' AND NOT rowsecurity",
      )
    ).rows[0].count,
    0,
  );
  await db.exec('SET ROLE anon');
  try {
    await assert.rejects(db.query('SELECT * FROM fhdod.surveys'), /permission denied/);
  } finally {
    await db.exec('RESET ROLE');
  }
  assert.deepEqual(
    await bootstrapPostgres(pool, {
      name: 'Novo admin',
      email: 'new@example.test',
      password: 'different-password-2026',
    }),
    { created: false },
  );
  assert.equal((await repo.listUsers()).length, 1);
});

test('Postgres submissions and consent are atomic, idempotent and separated from scoped analytics', async (t) => {
  const { db, repo } = await fixture(t);
  const contact = {
    name: 'Pessoa fictícia',
    phone: '51999999999',
    email: 'person@example.test',
    message: 'Um relato fictício sobre o atendimento.',
    consent: true,
    settingsVersion: 1,
  };
  const survey = sample({ contactRequest: contact });
  assert.equal((await repo.saveSurvey(survey, at)).duplicate, false);
  assert.equal((await repo.saveSurvey(survey, at)).duplicate, true);
  await assert.rejects(repo.saveSurvey({ ...survey, nps: 10 }, at), /ID_CONFLICT/);
  const all = await repo.listSurveys({ role: 'manager' });
  assert.equal(all.length, 1);
  assert.equal(all[0].nps, 0);
  assert.equal(JSON.stringify(all).includes(contact.phone), false);
  assert.equal((await repo.listSurveys({ role: 'management' }))[0].comment, '');
  assert.equal(
    (await repo.listSurveys({ role: 'sector-admin', sectorId: 'recepcao' }))[0].comment,
    '',
  );
  assert.deepEqual(await repo.listSurveys({ role: 'sector-admin', sectorId: 'enfermagem' }), []);
  const bad = sample({ contactRequest: { ...contact, settingsVersion: 999 } });
  await assert.rejects(repo.saveSurvey(bad, at), /INVALID_SETTINGS_VERSION/);
  const forged = sample();
  forged.answers[0].questionText = 'Texto adulterado';
  await assert.rejects(repo.saveSurvey(forged, at), /INVALID_QUESTION_SNAPSHOT/);
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM fhdod.surveys')).rows[0].count,
    1,
  );
  assert.equal((await repo.listContacts()).length, 1);
});

test('Postgres question and settings updates retain history and reject stale or forbidden writes', async (t) => {
  const { repo, administrator } = await fixture(t);
  const initial = await repo.listQuestions();
  const expected = Object.fromEntries(initial.map((q) => [q.id, q.version]));
  const edited = initial.map((q, i) =>
    i ? q : { ...q, text: 'A comunicação na recepção foi adequada?', version: 2 },
  );
  await repo.updateQuestions(edited, expected, administrator, at);
  await assert.rejects(
    repo.updateQuestions(edited, expected, administrator, at),
    /VERSION_CONFLICT/,
  );
  await assert.rejects(
    repo.createQuestion(
      { sectorId: 'enfermagem', text: 'O atendimento prestado foi adequado?' },
      { role: 'sector-admin', sectorId: 'recepcao' },
      at,
    ),
    /FORBIDDEN_SECTOR/,
  );
  await repo.createQuestion(
    { sectorId: 'geral', text: 'A orientação durante o atendimento foi adequada?' },
    administrator,
    at,
  );
  await assert.rejects(
    repo.updateQuestions(edited, expected, administrator, at),
    /QUESTION_SET_CHANGED/,
  );
  const old = await repo.readSettings();
  const next = await repo.updateSettings(
    { ...old, successText: 'Muito obrigado pela sua participação.' },
    old.version,
    administrator.id,
    at,
  );
  assert.equal(next.version, old.version + 1);
  await assert.rejects(
    repo.updateSettings(old, old.version, administrator.id, at),
    /SETTINGS_CONFLICT/,
  );
  const survey = sample({
    contactRequest: {
      name: 'Teste fictício',
      phone: '51999999999',
      message: 'Relato sintético para o teste.',
      consent: true,
      settingsVersion: old.version,
    },
  });
  await repo.saveSurvey(survey, at);
  const [contact] = await repo.listContacts();
  assert.equal(contact.consentText, old.contactConsent);
  assert.equal(
    (await repo.updateContactStatus(contact.id, 'em-analise', administrator.id, at)).status,
    'em-analise',
  );
});

test('Postgres authentication rotates sessions and supports all five roles without exposing password hashes', async (t) => {
  const { repo, db } = await fixture(t);
  const password = 'temporary-test-password-2026';
  for (const role of ['sector-admin', 'management', 'ombudsman', 'viewer']) {
    const user = await repo.createUser({
      name: role,
      email: `${role}@example.test`,
      password,
      role,
      sectorId: role === 'sector-admin' ? 'recepcao' : null,
      mustChangePassword: true,
    });
    assert.equal(user.mustChangePassword, true);
  }
  const user = (await repo.listUsers()).find((u) => u.role === 'management');
  assert.equal(JSON.stringify(await repo.listUsers()).includes('password_hash'), false);
  const issued = await repo.authenticate({
    email: user.email,
    password,
    now: 1000,
    expiresAt: 10000,
  });
  const session = await repo.readSession(issued.token, 2000);
  assert.equal(session.user.role, 'management');
  const changed = await repo.changePassword({
    userId: user.id,
    currentPassword: password,
    newPassword: 'personal-test-password-2026',
    sessionToken: issued.token,
    expiresAt: 10000,
    now: () => 3000,
  });
  assert.equal(await repo.readSession(issued.token, 4000), null);
  assert.equal((await repo.readSession(changed.token, 4000)).user.mustChangePassword, false);
  await assert.rejects(
    repo.authenticate({ email: user.email, password, now: 4000, expiresAt: 10000 }),
    /INVALID_CREDENTIALS/,
  );
  await repo.revokeSession(changed.token);
  assert.equal(await repo.readSession(changed.token, 4000), null);
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS count FROM fhdod.account_audit WHERE event=$1', [
        'password_changed',
      ])
    ).rows[0].count,
    1,
  );
});

test('Postgres rate counters are atomic SQL increments and retain only hashed keys', async (t) => {
  const { repo, db } = await fixture(t);
  const key = 'login:192.0.2.20';
  const results = await Promise.all(
    Array.from({ length: 15 }, () => repo.consumeRate(key, 10, 1000, 100)),
  );
  assert.equal(results.filter((r) => r.allowed).length, 10);
  assert.equal((await db.query('SELECT count FROM fhdod.rate_limits')).rows[0].count, 15);
  assert.equal(
    JSON.stringify((await db.query('SELECT * FROM fhdod.rate_limits')).rows).includes(key),
    false,
  );
  assert.equal((await repo.consumeRate(key, 10, 1000, 1101)).allowed, true);
});

test('Postgres transactions keep one checked-out client and roll back before releasing on failure', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
    },
    release: () => calls.push('release'),
  };
  await assert.rejects(
    postgresTransaction({ connect: async () => client }, async (db) => {
      assert.equal(db, client);
      await db.query('operation');
      throw new Error('original');
    }),
    /original/,
  );
  assert.deepEqual(calls, ['BEGIN', 'operation', 'ROLLBACK', 'release']);
  assert.throws(
    () => postgresPoolOptions('postgres://x:y@db.example.test/test?sslmode=disable'),
    /DATABASE_TLS_REQUIRED/,
  );
  assert.equal(
    postgresPoolOptions('postgres://x:y@db.example.test/test?sslmode=require').ssl
      .rejectUnauthorized,
    true,
  );
});
