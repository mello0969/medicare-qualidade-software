import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './app.mjs';
import { createUser, openDatabase } from './store.mjs';

const origin = 'http://127.0.0.1:5173';
const adminPassword = 'admin-test-password-2026';
const temporaryPassword = 'temporary-test-password-2026';
const personalPassword = 'private-personal-password-2026';
const administrator = {
  name: 'Administrador de teste',
  email: 'admin@example.test',
  password: adminPassword,
  role: 'manager',
  sectorId: null,
};
const colleague = {
  name: 'Gestor de teste',
  email: 'gestor@example.test',
  password: temporaryPassword,
  role: 'sector-admin',
  sectorId: 'recepcao',
};

async function fixture(t, { seedTemporaryManager = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'medicare-password-test-'));
  const dbPath = join(directory, 'test.sqlite');
  const db = openDatabase(dbPath);
  await createUser(db, { ...administrator, mustChangePassword: seedTemporaryManager });
  db.close();
  let server;
  let address;
  const start = async () => {
    server = createServer({ dbPath, origin });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    address = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    server.closeDatabase();
  };
  await start();
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = async (
    path,
    { method = 'GET', body, cookie, csrf, requestOrigin = origin } = {},
  ) => {
    const result = await fetch(`${address}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { Origin: requestOrigin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await result.text();
    return { status: result.status, data: text ? JSON.parse(text) : null, headers: result.headers };
  };
  const asSession = (response) => ({
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    csrf: response.data.csrfToken,
    response,
  });
  const login = async (email = administrator.email, password = adminPassword) => {
    const result = await request('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(result.status, 200);
    return asSession(result);
  };
  const createTemporaryAccount = async () => {
    const manager = await login();
    const result = await request('/api/admin/users', {
      ...manager,
      method: 'POST',
      body: colleague,
    });
    assert.equal(result.status, 201);
    return {
      manager,
      user: result.data.user,
      temporary: await login(colleague.email, temporaryPassword),
    };
  };
  return {
    request,
    login,
    asSession,
    dbPath,
    createTemporaryAccount,
    async restart() {
      await stop();
      await start();
    },
  };
}

test('Newly invited accounts require a personal password and never expose credentials to the administrator', async (t) => {
  const { request, createTemporaryAccount, dbPath } = await fixture(t);
  const { manager, user, temporary } = await createTemporaryAccount();
  assert.equal(user.mustChangePassword, true);
  assert.equal(temporary.response.data.user.mustChangePassword, true);
  const listing = await request('/api/admin/users', manager);
  assert.equal(listing.data.users.find((entry) => entry.id === user.id).mustChangePassword, true);
  const published = JSON.stringify([user, listing.data, temporary.response.data]);
  for (const secret of [temporaryPassword, 'password_hash', 'password_salt'])
    assert.ok(!published.includes(secret));
  const db = openDatabase(dbPath);
  const audit = db.prepare('SELECT * FROM account_audit WHERE user_id = ?').all(user.id);
  db.close();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].event, 'user_created');
  assert.equal(audit[0].actor_id, manager.response.data.user.id);
  assert.ok(!JSON.stringify(audit).includes(temporaryPassword));
});

test('A temporary session can inspect its session, read public questions and log out, but cannot bypass the access gate', async (t) => {
  const { request, createTemporaryAccount } = await fixture(t);
  const { temporary } = await createTemporaryAccount();
  assert.equal((await request('/api/auth/session', temporary)).data.user.mustChangePassword, true);
  assert.equal((await request('/api/questions', temporary)).status, 200);
  for (const [method, path] of [
    ['GET', '/api/responses'],
    ['POST', '/api/responses'],
    ['PUT', '/api/questions'],
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/users'],
    ['POST', '/api/questions'],
    ['PUT', '/api/settings'],
    ['GET', '/api/admin/contacts'],
    ['PATCH', '/api/admin/contacts/nonexistent'],
  ]) {
    const result = await request(path, {
      ...temporary,
      method,
      ...(method !== 'GET' ? { body: {} } : {}),
    });
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'PASSWORD_CHANGE_REQUIRED');
  }
  assert.equal((await request('/api/auth/logout', { ...temporary, method: 'POST' })).status, 204);
  assert.equal((await request('/api/auth/session', temporary)).data.user, null);
});

test('Password changes require a valid session, origin and CSRF token and reject weak, reused or incorrect passwords', async (t) => {
  const { request, createTemporaryAccount } = await fixture(t);
  const { temporary } = await createTemporaryAccount();
  const validBody = { currentPassword: temporaryPassword, newPassword: personalPassword };
  assert.equal(
    (await request('/api/auth/password', { method: 'POST', body: validBody })).status,
    401,
  );
  assert.equal(
    (
      await request('/api/auth/password', {
        ...temporary,
        method: 'POST',
        body: validBody,
        csrf: undefined,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/auth/password', {
        ...temporary,
        method: 'POST',
        body: validBody,
        requestOrigin: 'https://other.example',
      })
    ).status,
    403,
  );
  for (const newPassword of ['short', 'a'.repeat(129)]) {
    const result = await request('/api/auth/password', {
      ...temporary,
      method: 'POST',
      body: { ...validBody, newPassword },
    });
    assert.equal(result.status, 400);
    assert.equal(result.data.code, 'INVALID_NEW_PASSWORD');
  }
  const reused = await request('/api/auth/password', {
    ...temporary,
    method: 'POST',
    body: { ...validBody, newPassword: temporaryPassword },
  });
  assert.equal(reused.data.code, 'UNCHANGED_PASSWORD');
  const incorrect = await request('/api/auth/password', {
    ...temporary,
    method: 'POST',
    body: { ...validBody, currentPassword: 'wrong-current-password' },
  });
  assert.equal(incorrect.data.code, 'INVALID_PASSWORD');
  assert.equal((await request('/api/auth/session', temporary)).data.user.mustChangePassword, true);
  assert.equal(
    (await request('/api/auth/password', { ...temporary, method: 'POST', body: validBody })).status,
    200,
  );
});

test('A successful change revokes every old session, rotates the salt, keeps the personal password private and restores scoped access', async (t) => {
  const { request, login, asSession, createTemporaryAccount, dbPath, restart } = await fixture(t);
  const { manager, user, temporary } = await createTemporaryAccount();
  const otherBrowser = await login(colleague.email, temporaryPassword);
  let db = openDatabase(dbPath);
  const oldRow = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  db.close();
  const result = await request('/api/auth/password', {
    ...temporary,
    method: 'POST',
    body: { currentPassword: temporaryPassword, newPassword: personalPassword },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.mustChangePassword, false);
  const renewed = asSession(result);
  assert.notEqual(renewed.cookie, temporary.cookie);
  assert.notEqual(renewed.csrf, temporary.csrf);
  assert.equal((await request('/api/responses', renewed)).status, 200);
  assert.equal((await request('/api/admin/users', renewed)).status, 403);
  assert.equal((await request('/api/auth/session', temporary)).data.user, null);
  assert.equal((await request('/api/auth/session', otherBrowser)).data.user, null);
  assert.equal(
    (
      await request('/api/auth/login', {
        method: 'POST',
        body: { email: colleague.email, password: temporaryPassword },
      })
    ).status,
    401,
  );
  const again = await login(colleague.email, personalPassword);
  assert.equal(again.response.data.user.mustChangePassword, false);
  const listing = await request('/api/admin/users', manager);
  assert.equal(listing.data.users.find((entry) => entry.id === user.id).mustChangePassword, false);
  assert.ok(!JSON.stringify(listing.data).includes(personalPassword));
  db = openDatabase(dbPath);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  assert.notEqual(updated.password_salt, oldRow.password_salt);
  assert.notEqual(updated.password_hash, oldRow.password_hash);
  assert.equal(updated.must_change_password, 0);
  const audit = db
    .prepare('SELECT * FROM account_audit WHERE user_id = ? ORDER BY created_at')
    .all(user.id);
  assert.deepEqual(
    audit.map((entry) => entry.event),
    ['user_created', 'password_changed'],
  );
  assert.ok(!JSON.stringify(audit).includes(personalPassword));
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(user.id).count,
    2,
  );
  db.close();
  await restart();
  assert.equal((await request('/api/auth/session', renewed)).data.user.mustChangePassword, false);
  assert.equal((await request('/api/auth/session', otherBrowser)).data.user, null);
});

test('A manager with a temporary password also must change it before creating other accounts', async (t) => {
  const { request, login, asSession } = await fixture(t, { seedTemporaryManager: true });
  const temporary = await login();
  const blocked = await request('/api/admin/users', {
    ...temporary,
    method: 'POST',
    body: colleague,
  });
  assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');
  const result = await request('/api/auth/password', {
    ...temporary,
    method: 'POST',
    body: { currentPassword: adminPassword, newPassword: personalPassword },
  });
  assert.equal(result.status, 200);
  assert.equal(
    (await request('/api/admin/users', { ...asSession(result), method: 'POST', body: colleague }))
      .status,
    201,
  );
});

test('Concurrent password changes cannot reuse a revoked temporary session or overwrite the first personal password', async (t) => {
  const { request, login, asSession, createTemporaryAccount } = await fixture(t);
  const { temporary } = await createTemporaryAccount();
  const passwords = [personalPassword, 'another-personal-password-2026'];
  const results = await Promise.all(
    passwords.map((newPassword) =>
      request('/api/auth/password', {
        ...temporary,
        method: 'POST',
        body: { currentPassword: temporaryPassword, newPassword },
      }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
  const winner = results.findIndex((result) => result.status === 200);
  assert.equal((await request('/api/responses', asSession(results[winner]))).status, 200);
  assert.equal(
    (await login(colleague.email, passwords[winner])).response.data.user.mustChangePassword,
    false,
  );
  assert.equal(
    (
      await request('/api/auth/login', {
        method: 'POST',
        body: { email: colleague.email, password: passwords[1 - winner] },
      })
    ).status,
    401,
  );
});

test('Logging out while a password change is being verified prevents the revoked session from changing credentials', async (t) => {
  const { request, login, createTemporaryAccount } = await fixture(t);
  const { temporary } = await createTemporaryAccount();
  const [change, logout] = await Promise.all([
    request('/api/auth/password', {
      ...temporary,
      method: 'POST',
      body: { currentPassword: temporaryPassword, newPassword: personalPassword },
    }),
    request('/api/auth/logout', { ...temporary, method: 'POST' }),
  ]);
  assert.equal(logout.status, 204);
  assert.equal(change.status, 401);
  assert.equal(
    (await login(colleague.email, temporaryPassword)).response.data.user.mustChangePassword,
    true,
  );
});

test('Repeated incorrect current passwords are rate limited without removing the temporary password gate', async (t) => {
  const { request, createTemporaryAccount } = await fixture(t);
  const { temporary } = await createTemporaryAccount();
  const body = { currentPassword: 'incorrect-current-password', newPassword: personalPassword };
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await request('/api/auth/password', { ...temporary, method: 'POST', body })).status,
      400,
    );
  const limited = await request('/api/auth/password', { ...temporary, method: 'POST', body });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal((await request('/api/auth/session', temporary)).data.user.mustChangePassword, true);
});

test('Legacy database migration keeps account IDs, hashes and active sessions without forcing an existing account to change its password', async (t) => {
  const { request, login, dbPath, restart } = await fixture(t);
  const existing = await login();
  let db = openDatabase(dbPath);
  const previous = db.prepare('SELECT id, password_hash, password_salt FROM users').get();
  db.exec(
    'ALTER TABLE users DROP COLUMN must_change_password; DELETE FROM schema_version WHERE version >= 2;',
  );
  db.close();
  await restart();
  const session = await request('/api/auth/session', existing);
  assert.equal(session.data.user.mustChangePassword, false);
  assert.equal((await request('/api/admin/users', existing)).status, 200);
  db = openDatabase(dbPath);
  assert.deepEqual(
    db.prepare('SELECT id, password_hash, password_salt FROM users').get(),
    previous,
  );
  assert.equal(db.prepare('SELECT version FROM schema_version WHERE version = 2').get().version, 2);
  db.close();
});
