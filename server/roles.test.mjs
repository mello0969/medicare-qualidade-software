import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, clientAddress } from './app.mjs';
import { createUser, createSession, openDatabase } from './store.mjs';
import { DEFAULT_QUESTIONS } from '../src/domain.ts';

test('All five roles enforce their own routes and the public wall never returns individual data', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fhdod-roles-test-'));
  const dbPath = join(directory, 'test.sqlite');
  const db = openDatabase(dbPath);
  const password = 'roles-test-password-2026';
  for (const role of ['manager', 'sector-admin', 'management', 'ombudsman', 'viewer'])
    await createUser(db, {
      name: role,
      email: `${role}@example.test`,
      password,
      role,
      sectorId: role === 'sector-admin' ? 'recepcao' : null,
    });
  db.close();
  const origin = 'http://127.0.0.1:5173';
  const server = createServer({ dbPath, origin });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    await server.closeDatabase();
    rmSync(directory, { recursive: true, force: true });
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
      data: response.status === 204 ? null : await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const q = DEFAULT_QUESTIONS.find((q) => q.sectorId === 'recepcao');
  const submitted = await request('/responses', {
    method: 'POST',
    body: {
      id: randomUUID(),
      createdAt: '2020-01-01T00:00:00.000Z',
      sectorIds: ['recepcao'],
      answers: [
        {
          questionId: q.id,
          questionText: q.text,
          questionVersion: q.version,
          sectorId: q.sectorId,
          value: 1,
        },
      ],
      nps: 0,
      comment: 'PRIVATE_COMMENT_MARKER',
      shift: 'par',
      doctor: '',
      contactRequest: {
        name: 'PRIVATE_PERSON_MARKER',
        phone: '51987654321',
        email: 'person@example.test',
        message: 'Relato sintético para testar a permissão.',
        consent: true,
        settingsVersion: 1,
      },
    },
  });
  assert.equal(submitted.status, 201);
  const sessions = {};
  for (const role of ['manager', 'sector-admin', 'management', 'ombudsman', 'viewer']) {
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: `${role}@example.test`, password },
    });
    assert.equal(login.status, 200);
    const session = { cookie: login.cookie, csrf: login.data.csrfToken };
    sessions[role] = session;
    const responses = await request('/responses', session);
    assert.equal(
      responses.status,
      ['manager', 'sector-admin', 'management'].includes(role) ? 200 : 403,
      role,
    );
    if (role === 'management')
      assert.equal(JSON.stringify(responses.data).includes('PRIVATE_COMMENT_MARKER'), false);
    assert.equal(
      (await request('/admin/contacts', session)).status,
      ['manager', 'ombudsman'].includes(role) ? 200 : 403,
      role,
    );
    assert.equal(
      (await request('/admin/users', session)).status,
      role === 'manager' ? 200 : 403,
      role,
    );
    const current = (await request('/settings')).data.settings;
    assert.equal(
      (
        await request('/settings', {
          ...session,
          method: 'PUT',
          body: { settings: current, expectedVersion: current.version },
        })
      ).status,
      role === 'manager' ? 200 : 403,
      role,
    );
    assert.equal(
      (
        await request('/questions', {
          ...session,
          method: 'POST',
          body: { text: 'A orientação durante o atendimento foi clara?', sectorId: 'recepcao' },
        })
      ).status,
      ['manager', 'sector-admin'].includes(role) ? 201 : 403,
      role,
    );
  }
  const contacts = await request('/admin/contacts', sessions.ombudsman);
  assert.equal(contacts.data.contacts[0].name, 'PRIVATE_PERSON_MARKER');
  assert.equal(
    (
      await request(`/admin/contacts/${contacts.data.contacts[0].id}`, {
        ...sessions.ombudsman,
        method: 'PATCH',
        body: { status: 'em-analise' },
      })
    ).status,
    200,
  );
  const wall = await request('/wall');
  assert.equal(wall.status, 200);
  assert.ok(wall.data.summary);
  assert.equal(/PRIVATE_|51987654321|person@example/.test(JSON.stringify(wall.data)), false);
});

test('Upgrading two-role SQLite accounts preserves IDs, password hashes, sessions and audit references', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fhdod-roles-migration-'));
  const dbPath = join(directory, 'test.sqlite');
  let db = openDatabase(dbPath);
  const account = await createUser(db, {
    name: 'Admin antigo',
    email: 'legacy@example.test',
    password: 'legacy-password-2026',
    role: 'manager',
    sectorId: null,
  });
  const previous = db.prepare('SELECT * FROM users').get();
  createSession(db, account.id, Date.now() + 100000);
  db.exec(`PRAGMA foreign_keys=OFF;
    CREATE TABLE users_old (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      role TEXT NOT NULL CHECK(role IN ('manager','sector-admin')),sector_id TEXT,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,must_change_password INTEGER NOT NULL DEFAULT 0,
      CHECK((role='manager' AND sector_id IS NULL) OR(role='sector-admin' AND sector_id IS NOT NULL))) STRICT;
    INSERT INTO users_old SELECT * FROM users;DROP TABLE users;ALTER TABLE users_old RENAME TO users;`);
  db.close();
  db = openDatabase(dbPath);
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  assert.deepEqual(db.prepare('SELECT * FROM users').get(), previous);
  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM account_audit').get().count, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  await createUser(db, {
    name: 'Ouvidoria',
    email: 'contact@example.test',
    password: 'another-password-2026',
    role: 'ombudsman',
    sectorId: null,
  });
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('Client IP ignores spoofable forwarded headers outside the trusted Vercel runtime', () => {
  const req = {
    headers: { 'x-forwarded-for': '198.51.100.8', 'x-vercel-forwarded-for': '192.0.2.1' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(clientAddress(req, false), '127.0.0.1');
  assert.equal(clientAddress(req, true), '192.0.2.1');
  req.headers['x-vercel-forwarded-for'] = '192.0.2.1, 203.0.113.2';
  assert.equal(clientAddress(req, true), '127.0.0.1');
});
