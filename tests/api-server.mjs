import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, createUser, createSession } from '../server/store.mjs';
import { QA_MANAGER, QA_SECTOR } from './credentials.ts';

const directory = resolve(process.env.MEDICARE_E2E_DIRECTORY ?? '');
// Never seed or overwrite the development database, even if this script is launched manually.
if (
  !directory.startsWith(`${resolve(tmpdir())}\\medicare-e2e-`) &&
  !directory.startsWith(`${resolve(tmpdir())}/medicare-e2e-`)
) {
  throw new Error('O servidor de QA exige um diretório temporário exclusivo.');
}
process.env.MEDICARE_DB_PATH = join(directory, 'medicare.sqlite');
writeFileSync(join(directory, 'qa-run-id'), process.env.MEDICARE_E2E_RUN_ID ?? '');
const db = openDatabase(process.env.MEDICARE_DB_PATH);
const tokens = {};
for (const [key, input] of [
  ['manager', QA_MANAGER],
  ['sector', QA_SECTOR],
]) {
  const user = await createUser(db, input);
  const session = createSession(db, user.id, Date.now() + 8 * 60 * 60 * 1000);
  tokens[key] = session.token;
}
writeFileSync(join(directory, 'sessions.json'), JSON.stringify(tokens));
db.close();
await import('../server/index.mjs');
