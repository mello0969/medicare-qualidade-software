import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from './app.mjs';
import { createUser, openDatabase } from './store.mjs';
import { DEFAULT_QUESTIONS } from '../src/domain.ts';

const origin = 'http://127.0.0.1:5173';
const password = 'a-valid-test-password-2026';
const managerInput = {
  name: 'Gestão teste',
  email: 'gestao@example.test',
  password,
  role: 'manager',
  sectorId: null,
};
const sectorInput = {
  name: 'Recepção teste',
  email: 'recepcao@example.test',
  password,
  role: 'sector-admin',
  sectorId: 'recepcao',
};

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'medicare-api-test-'));
  const dbPath = join(dir, 'test.sqlite');
  const seedDb = openDatabase(dbPath);
  await createUser(seedDb, managerInput);
  await createUser(seedDb, sectorInput);
  seedDb.close();
  let server = createServer({ dbPath, origin, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let address = `http://127.0.0.1:${server.address().port}`;
  const request = async (
    path,
    { method = 'GET', body, cookie, csrf, requestOrigin = origin, headers = {} } = {},
  ) => {
    const response = await fetch(`${address}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { Origin: requestOrigin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  };
  const login = async (email = managerInput.email) => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get('set-cookie').split(';')[0],
      csrf: response.data.csrfToken,
      response,
    };
  };
  const stop = async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    server.closeDatabase();
  };
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    request,
    login,
    dbPath,
    async restart() {
      await stop();
      server = createServer({ dbPath, origin, ...options });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      address = `http://127.0.0.1:${server.address().port}`;
    },
  };
}

function survey({ sectors = ['recepcao'], questions = DEFAULT_QUESTIONS, ...overrides } = {}) {
  return {
    id: randomUUID(),
    createdAt: '2020-01-01T00:00:00.000Z',
    sectorIds: sectors,
    answers: questions
      .filter((q) => sectors.includes(q.sectorId))
      .map((q) => ({
        questionId: q.id,
        questionVersion: q.version,
        questionText: q.text,
        sectorId: q.sectorId,
        value: 4,
      })),
    nps: 10,
    comment: 'Comentário com referências a setores diferentes.',
    shift: 'par',
    doctor: 'Profissional teste',
    ...overrides,
  };
}
const versions = (questions) => Object.fromEntries(questions.map((q) => [q.id, q.version]));

test('Public questions are canonical and administrative data requires a session', async (t) => {
  const { request } = await fixture(t);
  assert.deepEqual((await request('/api/questions')).data.questions, DEFAULT_QUESTIONS);
  assert.deepEqual((await request('/api/auth/session')).data, { user: null, csrfToken: null });
  assert.equal((await request('/api/responses')).status, 401);
  assert.equal((await request('/api/admin/users')).status, 401);
});

test('Passwords are salted and hashed, login errors are generic, cookies are protected and logout revokes access', async (t) => {
  const { request, login, dbPath } = await fixture(t, { secureCookies: true });
  const db = openDatabase(dbPath);
  const rows = db.prepare('SELECT password_salt, password_hash FROM users').all();
  assert.notEqual(rows[0].password_salt, rows[1].password_salt);
  assert.notEqual(rows[0].password_hash, rows[1].password_hash);
  assert.ok(
    rows.every((row) => row.password_hash !== password && row.password_hash.length === 128),
  );
  db.close();
  const unknown = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'missing@example.test', password },
  });
  const wrong = await request('/api/auth/login', {
    method: 'POST',
    body: { email: managerInput.email, password: 'incorrect' },
  });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.data, wrong.data);
  const logged = await login();
  assert.match(logged.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(logged.response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.match(logged.response.headers.get('set-cookie'), /Secure/);
  assert.equal((await request('/api/auth/session', logged)).data.user.role, 'manager');
  assert.equal(
    (await request('/api/auth/logout', { ...logged, method: 'POST', csrf: undefined })).status,
    403,
  );
  assert.equal((await request('/api/auth/logout', { ...logged, method: 'POST' })).status, 204);
  assert.equal((await request('/api/responses', logged)).status, 401);
});

test('Sessions expire and only a token hash is stored in SQLite', async (t) => {
  let clock = Date.now();
  const { request, login, dbPath } = await fixture(t, { now: () => clock, sessionTtlMs: 1000 });
  const logged = await login();
  const db = openDatabase(dbPath);
  const session = db.prepare('SELECT * FROM sessions').get();
  assert.equal(session.token_hash.length, 64);
  assert.ok(!JSON.stringify(session).includes(logged.cookie.split('=')[1]));
  db.close();
  clock += 1001;
  assert.equal((await request('/api/responses', logged)).status, 401);
  assert.equal((await request('/api/auth/session', logged)).data.user, null);
});

test('Submissions persist across server restarts, use server time, and are idempotent', async (t) => {
  const { request, login, restart } = await fixture(t);
  const body = survey();
  const posted = await request('/api/responses', { method: 'POST', body });
  assert.equal(posted.status, 201);
  assert.notEqual(posted.data.createdAt, body.createdAt);
  const repeated = await request('/api/responses', {
    method: 'POST',
    body: { ...body, createdAt: new Date().toISOString() },
  });
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.data, posted.data);
  assert.equal(
    (await request('/api/responses', { method: 'POST', body: { ...body, nps: 0 } })).status,
    409,
  );
  await restart();
  const logged = await login();
  const loaded = (await request('/api/responses', logged)).data.responses;
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, body.id);
  assert.equal(loaded[0].createdAt, posted.data.createdAt);
  assert.deepEqual(
    loaded[0].answers,
    [...body.answers].sort((a, b) => a.questionId.localeCompare(b.questionId)),
  );
});

test('Forged question snapshots, duplicate answers/sectors, invalid UUIDs and out-of-range ratings are rejected', async (t) => {
  const { request } = await fixture(t);
  const base = survey();
  const variants = [
    { ...base, id: 'arbitrary-client-id' },
    { ...base, answers: [...base.answers, base.answers[0]] },
    { ...base, sectorIds: ['recepcao', 'recepcao'] },
    {
      ...base,
      answers: [{ ...base.answers[0], questionText: 'Texto falsificado para a pergunta.' }],
    },
    { ...base, answers: [{ ...base.answers[0], questionVersion: 999 }] },
    { ...base, answers: [{ ...base.answers[0], sectorId: 'medico' }] },
    { ...base, answers: [{ ...base.answers[0], value: 6 }] },
    { ...base, nps: 11 },
    { ...base, comment: 'a'.repeat(601) },
    { ...base, secretExtra: 'unrecognized' },
    { ...base, shift: ['par'] },
  ];
  for (const body of variants)
    assert.equal((await request('/api/responses', { method: 'POST', body })).status, 400);
  const logged = await fixtureLogin(request);
  assert.equal((await request('/api/responses', logged)).data.responses.length, 0);
});

async function fixtureLogin(request) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { email: managerInput.email, password },
  });
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: response.data.csrfToken,
  };
}

test('Sector administrators receive only their own sector answers and cannot access users or other-sector comments', async (t) => {
  const { request, login } = await fixture(t);
  const mixed = survey({ sectors: ['recepcao', 'medico'] });
  await request('/api/responses', { method: 'POST', body: mixed });
  await request('/api/responses', { method: 'POST', body: survey({ sectors: ['triagem'] }) });
  const logged = await login(sectorInput.email);
  const visible = (await request('/api/responses', logged)).data.responses;
  assert.equal(visible.length, 1);
  assert.deepEqual(visible[0].sectorIds, ['recepcao']);
  assert.ok(visible[0].answers.every((a) => a.sectorId === 'recepcao'));
  assert.equal(visible[0].comment, '');
  assert.equal(visible[0].doctor, '');
  assert.equal(visible[0].nps, 10);
  assert.equal((await request('/api/admin/users', logged)).status, 403);
  assert.equal(
    (await request('/api/admin/users', { ...logged, method: 'POST', body: managerInput })).status,
    403,
  );
});

test('Question editing requires CSRF and matching origin, enforces sector scope and preserves history with an audit', async (t) => {
  const { request, login, dbPath } = await fixture(t);
  const logged = await login(sectorInput.email);
  const questions = DEFAULT_QUESTIONS.map((q) => ({ ...q }));
  questions[0].text = 'Você recebeu todas as orientações na recepção?';
  const body = { questions, expectedVersions: versions(DEFAULT_QUESTIONS) };
  assert.equal(
    (await request('/api/questions', { ...logged, method: 'PUT', body, csrf: undefined })).status,
    403,
  );
  assert.equal(
    (
      await request('/api/questions', {
        ...logged,
        method: 'PUT',
        body,
        requestOrigin: 'https://other.example',
      })
    ).status,
    403,
  );
  const updated = await request('/api/questions', { ...logged, method: 'PUT', body });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.questions[0].version, 2);
  assert.equal(updated.data.questions[1].version, 1);
  assert.equal((await request('/api/questions', { ...logged, method: 'PUT', body })).status, 409);
  const forbidden = updated.data.questions.map((q) => ({ ...q }));
  forbidden.find((q) => q.sectorId === 'triagem').text = 'Pergunta indevida por outro setor?';
  assert.equal(
    (
      await request('/api/questions', {
        ...logged,
        method: 'PUT',
        body: { questions: forbidden, expectedVersions: versions(updated.data.questions) },
      })
    ).status,
    403,
  );
  const db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM question_audit').get().count, 1);
  assert.equal(
    db
      .prepare('SELECT COUNT(*) AS count FROM question_versions WHERE question_id = ?')
      .get(questions[0].id).count,
    2,
  );
  db.close();
  // A survey loaded before the edit can still submit its exact published version.
  assert.equal((await request('/api/responses', { method: 'POST', body: survey() })).status, 201);
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: survey({ questions: updated.data.questions }),
      })
    ).status,
    201,
  );
});

test('Only a manager can create users, validation rejects weak passwords and duplicate addresses', async (t) => {
  const { request, login } = await fixture(t);
  const logged = await login();
  const input = {
    name: 'Triagem',
    email: 'triagem@example.test',
    password,
    role: 'sector-admin',
    sectorId: 'triagem',
  };
  assert.equal(
    (
      await request('/api/admin/users', {
        ...logged,
        method: 'POST',
        body: { ...input, password: 'short' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/admin/users', {
        ...logged,
        method: 'POST',
        body: { ...input, sectorId: null },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/admin/users', { ...logged, method: 'POST', body: input, csrf: undefined }))
      .status,
    403,
  );
  const result = await request('/api/admin/users', { ...logged, method: 'POST', body: input });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.role, 'sector-admin');
  assert.ok(!JSON.stringify(result.data).includes(password));
  assert.equal(
    (await request('/api/admin/users', { ...logged, method: 'POST', body: input })).status,
    409,
  );
  const users = (await request('/api/admin/users', logged)).data.users;
  assert.equal(users.length, 3);
  assert.ok(users.every((user) => !('password_hash' in user) && !('password_salt' in user)));
});

test('Mutations enforce the configured origin, rate limits expire, and oversize requests are rejected', async (t) => {
  let clock = Date.now();
  const { request } = await fixture(t, {
    loginLimit: 2,
    responseLimit: 2,
    rateWindowMs: 1000,
    now: () => clock,
  });
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: survey(),
        requestOrigin: 'https://malicious.example',
      })
    ).status,
    403,
  );
  const invalidLogin = { email: 'unknown@example.test', password };
  assert.equal(
    (await request('/api/auth/login', { method: 'POST', body: invalidLogin })).status,
    401,
  );
  assert.equal(
    (await request('/api/auth/login', { method: 'POST', body: invalidLogin })).status,
    401,
  );
  const limited = await request('/api/auth/login', { method: 'POST', body: invalidLogin });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  clock += 1001;
  assert.equal(
    (await request('/api/auth/login', { method: 'POST', body: invalidLogin })).status,
    401,
  );
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: survey({ comment: 'x'.repeat(40000) }),
      })
    ).status,
    413,
  );
  assert.equal((await request('/api/responses', { method: 'POST', body: survey() })).status, 201);
  assert.equal((await request('/api/responses', { method: 'POST', body: survey() })).status, 429);
});
