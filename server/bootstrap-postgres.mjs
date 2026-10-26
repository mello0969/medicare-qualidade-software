import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { hashPassword, userInputValid } from './store.mjs';
import { postgresPoolOptions, postgresTransaction } from './postgres.mjs';

export async function bootstrapPostgres(pool, input) {
  const administrator = { ...input, role: 'manager', sectorId: null, mustChangePassword: true };
  if (!userInputValid(administrator)) throw new Error('INVALID_USER');
  const { salt, hash } = await hashPassword(administrator.password);
  return postgresTransaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(25010,3)');
    const existing = await db.query("SELECT id FROM fhdod.users WHERE role='manager' LIMIT 1");
    if (existing.rows.length) return { created: false };
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await db.query('INSERT INTO fhdod.users VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,1)', [
      id,
      administrator.name.trim(),
      administrator.email.trim().toLowerCase(),
      'manager',
      salt,
      hash,
      createdAt,
    ]);
    await db.query('INSERT INTO fhdod.account_audit VALUES ($1,$2,NULL,$3,$4)', [
      randomUUID(),
      id,
      'user_created',
      createdAt,
    ]);
    return { created: true };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
    pool = new pg.Pool(postgresPoolOptions(process.env.DATABASE_URL));
    const result = await bootstrapPostgres(pool, {
      name: process.env.MEDICARE_ADMIN_NAME,
      email: process.env.MEDICARE_ADMIN_EMAIL,
      password: process.env.MEDICARE_ADMIN_PASSWORD,
    });
    console.log(
      result.created
        ? 'Administrador criado com troca obrigatória de senha.'
        : 'Já existe um administrador. Nenhuma conta foi alterada.',
    );
  } catch (error) {
    console.error('Não foi possível preparar o administrador:', error.code ?? error.message);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
