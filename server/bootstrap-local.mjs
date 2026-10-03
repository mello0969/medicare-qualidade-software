import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, openDatabase } from './store.mjs';

// This is an explicit local setup command. Starting the API never creates credentials.
export async function bootstrapLocal({
  dbPath = process.env.MEDICARE_DB_PATH ?? 'data/medicare.sqlite',
  credentialsPath = '.local/administrador.txt',
} = {}) {
  const db = openDatabase(dbPath);
  const output = resolve(credentialsPath);
  let transactionOpen = false;
  let ownFile = false;
  let fileDescriptor;
  try {
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const manager = db.prepare("SELECT id FROM users WHERE role = 'manager' LIMIT 1").get();
    if (manager) {
      db.exec('ROLLBACK');
      transactionOpen = false;
      return { created: false };
    }
    // Exclusive creation also prevents another process from replacing existing local credentials.
    mkdirSync(dirname(output), { recursive: true });
    fileDescriptor = openSync(output, 'wx', 0o600);
    ownFile = true;
    const password = randomBytes(24).toString('base64url');
    const email = 'admin@medicare.local';
    writeFileSync(
      fileDescriptor,
      `Acesso local do projeto MediCare\n\nE-mail: ${email}\nSenha: ${password}\n\nGuarde este arquivo localmente. Ele não deve ser publicado no GitHub.\n`,
      { encoding: 'utf8' },
    );
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    await createUser(db, {
      name: 'Gestor do projeto',
      email,
      password,
      role: 'manager',
      sectorId: null,
    });
    db.exec('COMMIT');
    transactionOpen = false;
    return { created: true };
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {
        /* Preserve the original error. */
      }
      fileDescriptor = undefined;
    }
    if (transactionOpen) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* SQLite may already have rolled back after an I/O failure. */
      }
      transactionOpen = false;
    }
    if (ownFile) {
      // Remove only the exact credential file exclusively created by this invocation.
      unlinkSync(output);
      ownFile = false;
    }
    if (error.code === 'EEXIST') throw new Error('CREDENTIAL_FILE_EXISTS');
    throw error;
  } finally {
    db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await bootstrapLocal();
    console.log(
      result.created
        ? 'Gestor local criado. As credenciais foram salvas em .local/administrador.txt.'
        : 'Já existe um gestor. Nenhuma conta ou credencial foi alterada.',
    );
  } catch (error) {
    console.error(
      error.message === 'CREDENTIAL_FILE_EXISTS'
        ? 'O arquivo local de credenciais já existe. Confira-o antes de configurar outro gestor.'
        : 'Não foi possível preparar o gestor local. Verifique a configuração do banco.',
    );
    process.exitCode = 1;
  }
}
