import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresRepository } from './postgres.mjs';
import { createSqliteRepository } from './repository.mjs';
import { migratePostgres } from './migrate-postgres.mjs';
import { createServer } from './app.mjs';
import { openDatabase } from './store.mjs';
import { DEFAULT_QUESTIONS } from '../src/domain.ts';

const time = '2026-10-25T00:30:00.000Z'; // Still October 24 in São Paulo.
const schedule = {
  sectorId: 'recepcao',
  date: '2026-10-24',
  shift: 'manha',
  team: 'Equipe da manhã',
  expectedVersion: 0,
};
const survey = (overrides = {}) => ({
  id: randomUUID(),
  createdAt: time,
  sectorIds: ['recepcao'],
  answers: [],
  nps: 9,
  comment: '',
  shift: 'manha',
  doctor: '',
  attendanceDate: '2026-10-24',
  ...overrides,
});
async function repository(t, engine) {
  if (engine === 'sqlite') {
    const directory = mkdtempSync(join(tmpdir(), 'fhdod-schedule-test-'));
    const dbPath = join(directory, 'test.sqlite');
    const repo = createSqliteRepository(dbPath);
    t.after(() => {
      repo.close();
      rmSync(directory, { recursive: true, force: true });
    });
    return { repo, dbPath };
  }
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
  await migratePostgres(pool);
  const repo = createPostgresRepository({ pool });
  t.after(() => repo.close());
  return { repo, db };
}
const managerInput = {
  name: 'Administrador de teste',
  email: 'admin@example.test',
  password: 'schedule-password-2026',
  role: 'manager',
  sectorId: null,
};

for (const engine of ['sqlite', 'postgres']) {
  test(`${engine}: schedule snapshots match only sector/date/shift and remain immutable after edits`, async (t) => {
    const { repo } = await repository(t, engine);
    const admin = await repo.createUser(managerInput);
    assert.equal((await repo.updateSchedule(schedule, admin, time)).version, 1);
    await repo.updateSchedule(
      { ...schedule, sectorId: 'triagem', team: 'Equipe da triagem' },
      admin,
      time,
    );
    const sent = survey({ sectorIds: ['recepcao', 'triagem'] });
    await repo.saveSurvey(sent, time);
    assert.deepEqual((await repo.listSurveys(admin))[0].teams, [
      { sectorId: 'recepcao', name: 'Equipe da manhã', scheduleVersion: 1 },
      { sectorId: 'triagem', name: 'Equipe da triagem', scheduleVersion: 1 },
    ]);
    assert.equal((await repo.listSurveys(admin))[0].doctor, '');
    await repo.updateSchedule(
      { ...schedule, team: 'Nova equipe', expectedVersion: 1 },
      admin,
      time,
    );
    assert.equal((await repo.saveSurvey(sent, time)).duplicate, true);
    assert.equal(
      (await repo.listSurveys(admin)).find((r) => r.id === sent.id).teams[0].name,
      'Equipe da manhã',
    );
    const newer = survey();
    await repo.saveSurvey(newer, time);
    assert.deepEqual((await repo.listSurveys(admin)).find((r) => r.id === newer.id).teams, [
      { sectorId: 'recepcao', name: 'Nova equipe', scheduleVersion: 2 },
    ]);
    const scoped = (await repo.listSurveys({ role: 'sector-admin', sectorId: 'triagem' }))[0];
    assert.deepEqual(scoped.teams, [
      { sectorId: 'triagem', name: 'Equipe da triagem', scheduleVersion: 1 },
    ]);
    for (const overrides of [
      { shift: 'tarde' },
      { attendanceDate: '2026-10-23' },
      { sectorIds: ['enfermagem'] },
      { shift: 'par' },
      { attendanceDate: undefined },
    ]) {
      const unmatched = survey(overrides);
      await repo.saveSurvey(unmatched, time);
      assert.equal(
        (await repo.listSurveys(admin)).find((r) => r.id === unmatched.id).teams,
        undefined,
      );
    }
    await assert.rejects(
      Promise.resolve().then(() =>
        repo.saveSurvey({ ...sent, attendanceDate: '2026-10-23' }, time),
      ),
      /ID_CONFLICT/,
    );
  });

  test(`${engine}: concurrent schedule writers require the current version and sector managers cannot cross sectors`, async (t) => {
    const { repo } = await repository(t, engine);
    const admin = await repo.createUser(managerInput);
    await repo.updateSchedule(schedule, admin, time);
    const settled = await Promise.allSettled(
      ['Equipe A', 'Equipe B'].map((team) =>
        Promise.resolve().then(() =>
          repo.updateSchedule({ ...schedule, expectedVersion: 1, team }, admin, time),
        ),
      ),
    );
    assert.equal(settled.filter((result) => result.status === 'fulfilled').length, 1);
    assert.match(
      settled.find((result) => result.status === 'rejected').reason.message,
      /SCHEDULE_CONFLICT/,
    );
    const entries = await repo.listSchedules('2026-10', { role: 'management' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].version, 2);
    assert.deepEqual(await repo.listSchedules('2026-11', admin), []);
    const sector = await repo.createUser({
      ...managerInput,
      email: 'sector@example.test',
      role: 'sector-admin',
      sectorId: 'triagem',
    });
    assert.deepEqual(await repo.listSchedules('2026-10', sector), []);
    await assert.rejects(
      Promise.resolve().then(() =>
        repo.updateSchedule({ ...schedule, expectedVersion: 2 }, sector, time),
      ),
      /FORBIDDEN_SECTOR/,
    );
    await assert.rejects(
      Promise.resolve().then(() =>
        repo.updateSchedule({ ...schedule, expectedVersion: 99 }, admin, time),
      ),
      /SCHEDULE_CONFLICT/,
    );
    await assert.rejects(
      Promise.resolve().then(() =>
        repo.updateSchedule({ ...schedule, date: '2026-02-30' }, admin, time),
      ),
      /INVALID_SCHEDULE/,
    );
    await assert.rejects(
      Promise.resolve().then(() => repo.listSchedules('2026-13', admin)),
      /INVALID_SCHEDULE_MONTH/,
    );
  });
}

test('Schedule HTTP permissions, optimistic conflicts and public submissions reject forged teams and future Brazil dates', async (t) => {
  const { repo } = await repository(t, 'sqlite');
  for (const role of ['manager', 'sector-admin', 'management', 'ombudsman', 'viewer'])
    await repo.createUser({
      ...managerInput,
      email: `${role}@example.test`,
      name: role,
      role,
      sectorId: role === 'sector-admin' ? 'recepcao' : null,
    });
  const origin = 'http://127.0.0.1:5173';
  const server = createServer({ repository: repo, origin, now: () => Date.parse(time) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  const request = async (path, { method = 'GET', body, cookie, csrf } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  assert.equal((await request('/schedules?month=2026-10')).status, 401);
  const sessions = {};
  for (const role of ['manager', 'sector-admin', 'management', 'ombudsman', 'viewer']) {
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: `${role}@example.test`, password: managerInput.password },
    });
    const session = { cookie: login.cookie, csrf: login.data.csrfToken };
    sessions[role] = session;
    assert.equal(
      (await request('/schedules?month=2026-10', session)).status,
      ['manager', 'management', 'sector-admin'].includes(role) ? 200 : 403,
    );
    if (!['manager', 'sector-admin'].includes(role))
      assert.equal(
        (await request('/schedules', { ...session, method: 'PUT', body: schedule })).status,
        403,
      );
  }
  assert.equal(
    (
      await request('/schedules', {
        cookie: sessions.manager.cookie,
        method: 'PUT',
        body: schedule,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/schedules', { ...sessions.manager, method: 'PUT', body: schedule })).status,
    200,
  );
  assert.equal(
    (
      await request('/schedules', {
        ...sessions['sector-admin'],
        method: 'PUT',
        body: { ...schedule, sectorId: 'triagem' },
      })
    ).status,
    403,
  );
  assert.equal((await request('/schedules?month=2026-99', sessions.manager)).status, 400);
  const conflicts = await Promise.all(
    ['Equipe A', 'Equipe B'].map((team) =>
      request('/schedules', {
        ...sessions.manager,
        method: 'PUT',
        body: { ...schedule, team, expectedVersion: 1 },
      }),
    ),
  );
  assert.deepEqual(conflicts.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await request('/responses', {
        method: 'POST',
        body: survey({ attendanceDate: '2026-10-25' }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/responses', {
        method: 'POST',
        body: survey({
          teams: [{ sectorId: 'recepcao', name: 'Equipe inventada', scheduleVersion: 1 }],
        }),
      })
    ).status,
    400,
  );
  assert.equal((await request('/responses', { method: 'POST', body: survey() })).status, 201);
  const stored = (await request('/responses', sessions.manager)).data.responses[0];
  assert.equal(stored.attendanceDate, '2026-10-24');
  assert.equal(stored.teams[0].scheduleVersion, 2);
  assert.equal(stored.doctor, '');
});

test('Legacy SQLite survey migration preserves answers, contacts, idempotence and foreign keys', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fhdod-schedule-migration-'));
  const dbPath = join(directory, 'test.sqlite');
  let db = openDatabase(dbPath);
  const { createUser, saveSurvey } = await import('./store.mjs');
  await createUser(db, managerInput);
  const question = DEFAULT_QUESTIONS[0];
  const old = survey({
    shift: 'par',
    attendanceDate: undefined,
    answers: [
      {
        questionId: question.id,
        questionText: question.text,
        questionVersion: question.version,
        sectorId: question.sectorId,
        value: 1,
      },
    ],
    contactRequest: {
      name: 'Pessoa fictícia',
      phone: '51999999999',
      message: 'Relato sintético para migração.',
      consent: true,
      settingsVersion: 1,
    },
  });
  saveSurvey(db, old, time);
  db.exec(`PRAGMA foreign_keys=OFF;CREATE TABLE surveys_old (
    id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload_hash TEXT NOT NULL,nps INTEGER,comment TEXT NOT NULL,
    shift TEXT NOT NULL CHECK(shift IN ('par','impar','nao-informado')),doctor TEXT NOT NULL) STRICT;
    INSERT INTO surveys_old SELECT id,created_at,payload_hash,nps,comment,shift,doctor FROM surveys;
    DROP TABLE surveys;ALTER TABLE surveys_old RENAME TO surveys;`);
  db.close();
  db = openDatabase(dbPath);
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('SELECT count(*) AS count FROM answers').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM contact_requests').get().count, 1);
  assert.equal(saveSurvey(db, old, time).duplicate, true);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});
