import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DEFAULT_QUESTIONS, DEFAULT_SETTINGS } from '../src/domain.ts';
import { postgresPoolOptions, postgresTransaction } from './postgres.mjs';

export async function migratePostgres(pool) {
  await postgresTransaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(25010,0)');
    await db.query(readFileSync(new URL('./postgres-schema.sql', import.meta.url), 'utf8'));
    await db.query(readFileSync(new URL('./schedules-schema.sql', import.meta.url), 'utf8'));
    const createdAt = new Date().toISOString();
    for (const q of DEFAULT_QUESTIONS) {
      await db.query(
        `INSERT INTO fhdod.questions (id,sector_id,current_version)
        VALUES ($1,$2,1) ON CONFLICT (id) DO NOTHING`,
        [q.id, q.sectorId],
      );
      await db.query(
        `INSERT INTO fhdod.question_versions VALUES ($1,1,$2,$3)
        ON CONFLICT (question_id,version) DO NOTHING`,
        [q.id, q.text, createdAt],
      );
    }
    await db.query(
      `INSERT INTO fhdod.survey_settings_versions VALUES ($1,$2,$3,NULL)
      ON CONFLICT (version) DO NOTHING`,
      [DEFAULT_SETTINGS.version, JSON.stringify(DEFAULT_SETTINGS), createdAt],
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
    pool = new pg.Pool(postgresPoolOptions(process.env.DATABASE_URL));
    await migratePostgres(pool);
    console.log('Estrutura Postgres preparada. Dados e contas existentes foram preservados.');
  } catch (error) {
    console.error('Não foi possível preparar o Postgres:', error.code ?? error.message);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
