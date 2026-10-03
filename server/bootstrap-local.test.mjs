import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapLocal } from './bootstrap-local.mjs';
import { createUser, openDatabase, verifyPassword } from './store.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'medicare-bootstrap-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    dbPath: join(dir, 'test.sqlite'),
    credentialsPath: join(dir, '.local', 'administrador.txt'),
  };
}
function managers(dbPath) {
  const db = openDatabase(dbPath);
  const rows = db.prepare("SELECT * FROM users WHERE role = 'manager'").all();
  db.close();
  return rows;
}

test('An unwritable credential location does not create an inaccessible manager and setup can be retried', async (t) => {
  const { dir, dbPath, credentialsPath } = fixture(t);
  const blocker = join(dir, 'blocking-file');
  writeFileSync(blocker, 'preserved');
  await assert.rejects(
    bootstrapLocal({ dbPath, credentialsPath: join(blocker, 'administrador.txt') }),
  );
  assert.equal(managers(dbPath).length, 0);
  assert.equal(readFileSync(blocker, 'utf8'), 'preserved');
  assert.deepEqual(await bootstrapLocal({ dbPath, credentialsPath }), { created: true });
  const [manager] = managers(dbPath);
  const content = readFileSync(credentialsPath, 'utf8');
  const password = content.match(/Senha: (.+)/)[1];
  assert.equal(await verifyPassword(password, manager), true);
});

test('An existing credential file is preserved and no account is created', async (t) => {
  const { dir, dbPath } = fixture(t);
  const credentialsPath = join(dir, 'existing.txt');
  writeFileSync(credentialsPath, 'existing credentials');
  await assert.rejects(bootstrapLocal({ dbPath, credentialsPath }), /CREDENTIAL_FILE_EXISTS/);
  assert.equal(readFileSync(credentialsPath, 'utf8'), 'existing credentials');
  assert.equal(managers(dbPath).length, 0);
});

test('An existing manager keeps the same account and credentials even if the requested path cannot be written', async (t) => {
  const { dir, dbPath } = fixture(t);
  const db = openDatabase(dbPath);
  await createUser(db, {
    name: 'Gestor existente',
    email: 'manager@example.test',
    password: 'existing-password-12345',
    role: 'manager',
    sectorId: null,
  });
  db.close();
  const before = managers(dbPath);
  const blocker = join(dir, 'blocking-file');
  writeFileSync(blocker, 'preserved');
  assert.deepEqual(
    await bootstrapLocal({ dbPath, credentialsPath: join(blocker, 'administrador.txt') }),
    { created: false },
  );
  assert.deepEqual(managers(dbPath), before);
  assert.equal(readFileSync(blocker, 'utf8'), 'preserved');
});

test('A database account conflict rolls back and removes only the newly created credential file', async (t) => {
  const { dir, dbPath, credentialsPath } = fixture(t);
  const db = openDatabase(dbPath);
  const existing = await createUser(db, {
    name: 'Setor existente',
    email: 'admin@medicare.local',
    password: 'existing-password-12345',
    role: 'sector-admin',
    sectorId: 'recepcao',
  });
  db.close();
  const unrelated = join(dir, 'preserve.txt');
  writeFileSync(unrelated, 'preserved');
  await assert.rejects(bootstrapLocal({ dbPath, credentialsPath }), /DUPLICATE_USER/);
  assert.equal(managers(dbPath).length, 0);
  assert.equal(existsSync(credentialsPath), false);
  assert.equal(readFileSync(unrelated, 'utf8'), 'preserved');
  const check = openDatabase(dbPath);
  assert.equal(check.prepare('SELECT id FROM users').get().id, existing.id);
  check.close();
});
