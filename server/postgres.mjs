import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { isSector } from '../src/domain.ts';
import {
  hashPassword,
  publicUser,
  responseHash,
  tokenHash,
  userInputValid,
  verifyPassword,
} from './store.mjs';
import { validSettings } from './experience.mjs';
import {
  SCHEDULE_SHIFTS,
  publicSurveySchedule,
  requireScheduleWrite,
  validScheduleMonth,
} from './schedules.mjs';

export function postgresPoolOptions(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && url.searchParams.get('sslmode') === 'disable')
    throw new Error('DATABASE_TLS_REQUIRED');
  // pg's connection-string sslmode can override the explicit verification settings.
  for (const key of [
    'ssl',
    'sslmode',
    'sslcert',
    'sslkey',
    'sslrootcert',
    'sslnegotiation',
    'uselibpqcompat',
  ])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.MEDICARE_DB_CA_PEM || process.env.MEDICARE_DB_CA_FILE
            ? {
                ca:
                  process.env.MEDICARE_DB_CA_PEM ??
                  readFileSync(process.env.MEDICARE_DB_CA_FILE, 'utf8'),
              }
            : {}),
        },
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
}

export async function postgresTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* Preserve the operation's error. */
    }
    throw error;
  } finally {
    client.release();
  }
}

const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const one = async (db, sql, params = []) => (await rows(db, sql, params))[0];
const questions = (db) =>
  rows(
    db,
    `SELECT q.id,q.sector_id AS "sectorId",v.text,q.current_version AS version
  FROM fhdod.questions q JOIN fhdod.question_versions v
  ON v.question_id=q.id AND v.version=q.current_version ORDER BY q.position`,
  );
const settings = async (db, version) => {
  const row = await one(
    db,
    version === undefined
      ? 'SELECT settings_json FROM fhdod.survey_settings_versions ORDER BY version DESC LIMIT 1'
      : 'SELECT settings_json FROM fhdod.survey_settings_versions WHERE version=$1',
    version === undefined ? [] : [version],
  );
  return row ? JSON.parse(row.settings_json) : null;
};
async function readSession(db, token, now, lock = false) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await one(
    db,
    `SELECT u.*,s.csrf_token FROM fhdod.sessions s JOIN fhdod.users u
    ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2${lock ? ' FOR UPDATE OF s' : ''}`,
    [tokenHash(token), now],
  );
  return row ? { user: publicUser(row), csrfToken: row.csrf_token } : null;
}
async function createSession(db, userId, expiresAt) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO fhdod.sessions VALUES ($1,$2,$3,$4)', [
    tokenHash(token),
    userId,
    csrfToken,
    expiresAt,
  ]);
  return { token, csrfToken };
}
async function publicContact(db, row) {
  return {
    id: row.id,
    surveyId: row.survey_id,
    createdAt: row.created_at,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    settingsVersion: row.settings_version,
    consentText: row.consent_text,
    status: row.status,
    sectorIds: (
      await rows(
        db,
        'SELECT sector_id FROM fhdod.survey_sectors WHERE survey_id=$1 ORDER BY sector_id',
        [row.survey_id],
      )
    ).map((s) => s.sector_id),
  };
}

export function createPostgresRepository({
  connectionString = process.env.DATABASE_URL,
  pool: suppliedPool,
} = {}) {
  const pool = suppliedPool ?? new pg.Pool(postgresPoolOptions(connectionString));
  // A temporary connection failure must not permanently poison a warm Function.
  pool.on?.('error', (error) =>
    console.error('Conexão Postgres interrompida:', error.code ?? error.name),
  );
  return {
    kind: 'postgres',
    ready: Promise.resolve(),
    close: () => pool.end(),
    listQuestions: () => questions(pool),
    readSettings: () => settings(pool),
    readSession: (token, now) => readSession(pool, token, now),
    async authenticate({ email, password, previousToken, now, expiresAt }) {
      const user = await one(pool, 'SELECT * FROM fhdod.users WHERE lower(email)=$1', [email]);
      if (!(await verifyPassword(password, user))) throw new Error('INVALID_CREDENTIALS');
      return postgresTransaction(pool, async (db) => {
        const current = await one(
          db,
          'SELECT password_hash FROM fhdod.users WHERE id=$1 FOR UPDATE',
          [user.id],
        );
        if (current?.password_hash !== user.password_hash) throw new Error('INVALID_CREDENTIALS');
        await db.query('DELETE FROM fhdod.sessions WHERE expires_at<=$1', [now]);
        if (previousToken)
          await db.query('DELETE FROM fhdod.sessions WHERE token_hash=$1', [
            tokenHash(previousToken),
          ]);
        return createSession(db, user.id, expiresAt);
      });
    },
    revokeSession: (token) =>
      pool.query('DELETE FROM fhdod.sessions WHERE token_hash=$1', [tokenHash(token)]),
    async changePassword({
      userId,
      currentPassword,
      newPassword,
      sessionToken,
      expiresAt,
      now = Date.now,
    }) {
      const user = await one(pool, 'SELECT * FROM fhdod.users WHERE id=$1', [userId]);
      if (!(await verifyPassword(currentPassword, user))) throw new Error('INVALID_PASSWORD');
      const { salt, hash } = await hashPassword(newPassword);
      return postgresTransaction(pool, async (db) => {
        const current = await one(
          db,
          'SELECT password_hash FROM fhdod.users WHERE id=$1 FOR UPDATE',
          [userId],
        );
        const session = await readSession(db, sessionToken, now(), true);
        if (!current || current.password_hash !== user.password_hash || session?.user.id !== userId)
          throw new Error('SESSION_STALE');
        await db.query(
          'UPDATE fhdod.users SET password_salt=$1,password_hash=$2,must_change_password=0 WHERE id=$3',
          [salt, hash, userId],
        );
        await db.query('DELETE FROM fhdod.sessions WHERE user_id=$1', [userId]);
        const created = await createSession(db, userId, expiresAt);
        await db.query('INSERT INTO fhdod.account_audit VALUES ($1,$2,$3,$4,$5)', [
          randomUUID(),
          userId,
          userId,
          'password_changed',
          new Date(now()).toISOString(),
        ]);
        return created;
      });
    },
    async createUser(input, now = Date.now(), actorId = null) {
      if (!userInputValid(input)) throw new Error('INVALID_USER');
      const { salt, hash } = await hashPassword(input.password);
      const user = {
        id: randomUUID(),
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        sector_id: input.sectorId,
        must_change_password: input.mustChangePassword ? 1 : 0,
      };
      try {
        await postgresTransaction(pool, async (db) => {
          await db.query('INSERT INTO fhdod.users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
            user.id,
            user.name,
            user.email,
            user.role,
            user.sector_id,
            salt,
            hash,
            new Date(now).toISOString(),
            user.must_change_password,
          ]);
          await db.query('INSERT INTO fhdod.account_audit VALUES ($1,$2,$3,$4,$5)', [
            randomUUID(),
            user.id,
            actorId,
            'user_created',
            new Date(now).toISOString(),
          ]);
        });
      } catch (error) {
        if (error.code === '23505') throw new Error('DUPLICATE_USER');
        throw error;
      }
      return publicUser(user);
    },
    listUsers: async () =>
      (await rows(pool, 'SELECT * FROM fhdod.users ORDER BY name')).map(publicUser),
    async saveSurvey(response, createdAt) {
      const hash = responseHash(response);
      return postgresTransaction(pool, async (db) => {
        const teams =
          response.attendanceDate && SCHEDULE_SHIFTS.includes(response.shift)
            ? await rows(
                db,
                `SELECT sector_id AS "sectorId",team AS name,version AS "scheduleVersion"
              FROM fhdod.shift_schedules WHERE attendance_date=$1 AND shift=$2 AND sector_id=ANY($3::text[])
              ORDER BY sector_id`,
                [response.attendanceDate, response.shift, response.sectorIds],
              )
            : [];
        const added = await one(
          db,
          `INSERT INTO fhdod.surveys (id,created_at,payload_hash,nps,comment,shift,doctor,attendance_date,teams_json)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            response.id,
            createdAt,
            hash,
            response.nps,
            response.comment,
            response.shift,
            response.doctor,
            response.attendanceDate ?? null,
            JSON.stringify(teams),
          ],
        );
        if (!added) {
          const existing = await one(
            db,
            'SELECT id,created_at,payload_hash FROM fhdod.surveys WHERE id=$1',
            [response.id],
          );
          if (existing.payload_hash !== hash) throw new Error('ID_CONFLICT');
          return { id: existing.id, createdAt: existing.created_at, duplicate: true };
        }
        for (const answer of response.answers) {
          const q = await one(
            db,
            `SELECT q.sector_id,v.text FROM fhdod.question_versions v JOIN fhdod.questions q
            ON q.id=v.question_id WHERE v.question_id=$1 AND v.version=$2`,
            [answer.questionId, answer.questionVersion],
          );
          if (
            !q ||
            q.sector_id !== answer.sectorId ||
            q.text !== answer.questionText ||
            (answer.sectorId !== 'geral' && !response.sectorIds.includes(answer.sectorId))
          )
            throw new Error('INVALID_QUESTION_SNAPSHOT');
        }
        for (const sector of response.sectorIds)
          await db.query('INSERT INTO fhdod.survey_sectors VALUES ($1,$2)', [response.id, sector]);
        for (const a of response.answers)
          await db.query('INSERT INTO fhdod.answers VALUES ($1,$2,$3,$4,$5)', [
            response.id,
            a.questionId,
            a.questionVersion,
            a.sectorId,
            a.value,
          ]);
        if (response.contactRequest) {
          const c = response.contactRequest;
          const accepted = await settings(db, c.settingsVersion);
          if (!accepted) throw new Error('INVALID_SETTINGS_VERSION');
          await db.query(
            'INSERT INTO fhdod.contact_requests VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [
              randomUUID(),
              response.id,
              createdAt,
              c.name.trim(),
              c.phone.trim(),
              (c.email ?? '').trim().toLowerCase(),
              c.message.trim(),
              c.settingsVersion,
              accepted.contactConsent,
              'novo',
            ],
          );
        }
        return { id: response.id, createdAt, duplicate: false };
      });
    },
    async listSurveys(user) {
      const scoped = user.role === 'sector-admin';
      const surveys = await rows(
        pool,
        scoped
          ? `SELECT s.* FROM fhdod.surveys s JOIN fhdod.survey_sectors ss ON ss.survey_id=s.id WHERE ss.sector_id=$1 ORDER BY s.created_at DESC,s.id`
          : 'SELECT * FROM fhdod.surveys ORDER BY created_at DESC,id',
        scoped ? [user.sectorId] : [],
      );
      if (!surveys.length) return [];
      const ids = surveys.map((s) => s.id);
      const sectors = await rows(
        pool,
        'SELECT survey_id,sector_id FROM fhdod.survey_sectors WHERE survey_id=ANY($1::text[]) ORDER BY sector_id',
        [ids],
      );
      const answers = await rows(
        pool,
        `SELECT a.survey_id,a.question_id AS "questionId",a.question_version AS "questionVersion",
        v.text AS "questionText",a.sector_id AS "sectorId",a.value FROM fhdod.answers a JOIN fhdod.question_versions v
        ON v.question_id=a.question_id AND v.version=a.question_version WHERE a.survey_id=ANY($1::text[]) ORDER BY a.question_id`,
        [ids],
      );
      return surveys.map((s) => ({
        id: s.id,
        createdAt: s.created_at,
        sectorIds: scoped
          ? [user.sectorId]
          : sectors.filter((a) => a.survey_id === s.id).map((a) => a.sector_id),
        answers: answers
          .filter((a) => a.survey_id === s.id && (!scoped || a.sectorId === user.sectorId))
          .map(({ survey_id, ...a }) => a),
        nps: s.nps,
        comment: user.role === 'manager' ? s.comment : '',
        shift: s.shift,
        doctor: scoped && user.sectorId !== 'medico' ? '' : s.doctor,
        ...publicSurveySchedule(s, user),
      }));
    },
    updateQuestions(input, expectedVersions, user, createdAt) {
      return postgresTransaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(25010,1)');
        const current = await questions(db);
        if (
          input.length !== current.length ||
          input.some((q) => !current.some((old) => old.id === q.id))
        )
          throw new Error('QUESTION_SET_CHANGED');
        for (const q of input) {
          const old = current.find((a) => a.id === q.id);
          if (q.sectorId !== old.sectorId) throw new Error('INVALID_QUESTIONS');
          const own = user.role === 'manager' || q.sectorId === user.sectorId;
          if (!own && (q.text !== old.text || q.version !== old.version))
            throw new Error('FORBIDDEN_SECTOR');
          if (
            own &&
            (expectedVersions[q.id] !== old.version ||
              ![old.version, old.version + 1].includes(q.version))
          )
            throw new Error('VERSION_CONFLICT');
        }
        for (const q of input) {
          const old = current.find((a) => a.id === q.id);
          if (q.text === old.text) continue;
          const next = old.version + 1;
          await db.query('INSERT INTO fhdod.question_versions VALUES ($1,$2,$3,$4)', [
            q.id,
            next,
            q.text,
            createdAt,
          ]);
          await db.query('UPDATE fhdod.questions SET current_version=$1 WHERE id=$2', [next, q.id]);
          await db.query('INSERT INTO fhdod.question_audit VALUES ($1,$2,$3,$4,$5,$6)', [
            randomUUID(),
            q.id,
            user.id,
            old.version,
            next,
            createdAt,
          ]);
        }
        return questions(db);
      });
    },
    async createQuestion(input, user, createdAt) {
      if (
        !input ||
        typeof input.text !== 'string' ||
        input.text.trim().length < 8 ||
        input.text.length > 160 ||
        !(isSector(input.sectorId) || input.sectorId === 'geral')
      )
        throw new Error('INVALID_QUESTIONS');
      if (user.role !== 'manager' && input.sectorId !== user.sectorId)
        throw new Error('FORBIDDEN_SECTOR');
      return postgresTransaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(25010,1)');
        if ((await questions(db)).length >= 60) throw new Error('QUESTION_LIMIT');
        const q = {
          id: randomUUID(),
          sectorId: input.sectorId,
          text: input.text.trim(),
          version: 1,
        };
        await db.query(
          'INSERT INTO fhdod.questions (id,sector_id,current_version) VALUES ($1,$2,1)',
          [q.id, q.sectorId],
        );
        await db.query('INSERT INTO fhdod.question_versions VALUES ($1,1,$2,$3)', [
          q.id,
          q.text,
          createdAt,
        ]);
        await db.query('INSERT INTO fhdod.question_audit VALUES ($1,$2,$3,0,1,$4)', [
          randomUUID(),
          q.id,
          user.id,
          createdAt,
        ]);
        return q;
      });
    },
    async updateSettings(input, expectedVersion, userId, createdAt) {
      if (!validSettings(input) || !Number.isInteger(expectedVersion) || expectedVersion < 1)
        throw new Error('INVALID_SETTINGS');
      return postgresTransaction(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(25010,2)');
        const current = await settings(db);
        if (
          expectedVersion !== current.version ||
          ![current.version, current.version + 1].includes(input.version)
        )
          throw new Error('SETTINGS_CONFLICT');
        const next = Object.fromEntries(
          Object.keys(current).map((field) => [
            field,
            field === 'version' ? current.version : input[field].trim(),
          ]),
        );
        if (JSON.stringify(next) === JSON.stringify(current)) return current;
        next.version = current.version + 1;
        await db.query('INSERT INTO fhdod.survey_settings_versions VALUES ($1,$2,$3,$4)', [
          next.version,
          JSON.stringify(next),
          createdAt,
          userId,
        ]);
        return next;
      });
    },
    async listContacts() {
      const contacts = await rows(
        pool,
        'SELECT * FROM fhdod.contact_requests ORDER BY created_at DESC,id',
      );
      return Promise.all(contacts.map((c) => publicContact(pool, c)));
    },
    async updateContactStatus(id, status, userId, createdAt) {
      if (!['novo', 'em-analise', 'concluido'].includes(status))
        throw new Error('INVALID_CONTACT_STATUS');
      return postgresTransaction(pool, async (db) => {
        const contact = await one(
          db,
          'SELECT * FROM fhdod.contact_requests WHERE id=$1 FOR UPDATE',
          [id],
        );
        if (!contact) throw new Error('CONTACT_NOT_FOUND');
        if (contact.status !== status) {
          await db.query('UPDATE fhdod.contact_requests SET status=$1 WHERE id=$2', [status, id]);
          await db.query('INSERT INTO fhdod.contact_status_audit VALUES ($1,$2,$3,$4,$5,$6)', [
            randomUUID(),
            id,
            userId,
            contact.status,
            status,
            createdAt,
          ]);
        }
        return publicContact(db, { ...contact, status });
      });
    },
    async consumeRate(key, maximum, windowMs, now) {
      const keyHash = tokenHash(key);
      const bucket = await one(
        pool,
        `INSERT INTO fhdod.rate_limits VALUES ($1,1,$2)
        ON CONFLICT (key_hash) DO UPDATE SET
          count=CASE WHEN fhdod.rate_limits.until_ms<=$3 THEN 1 ELSE fhdod.rate_limits.count+1 END,
          until_ms=CASE WHEN fhdod.rate_limits.until_ms<=$3 THEN $2 ELSE fhdod.rate_limits.until_ms END
        RETURNING count,until_ms`,
        [keyHash, now + windowMs, now],
      );
      // Expired keys contain only hashes and are bounded to one window of traffic.
      await pool.query('DELETE FROM fhdod.rate_limits WHERE until_ms<=$1', [now]);
      return {
        allowed: bucket.count <= maximum,
        retryAfter: Math.max(1, Math.ceil((Number(bucket.until_ms) - now) / 1000)),
      };
    },
    async listSchedules(month, user) {
      if (!validScheduleMonth(month)) throw new Error('INVALID_SCHEDULE_MONTH');
      const scoped = user.role === 'sector-admin';
      return rows(
        pool,
        `SELECT sector_id AS "sectorId",attendance_date AS date,shift,team,version
        FROM fhdod.shift_schedules WHERE attendance_date LIKE $1${scoped ? ' AND sector_id=$2' : ''}
        ORDER BY attendance_date,sector_id,shift`,
        scoped ? [`${month}-%`, user.sectorId] : [`${month}-%`],
      );
    },
    async updateSchedule(input, user, createdAt) {
      requireScheduleWrite(input, user);
      return postgresTransaction(pool, async (db) => {
        const result =
          input.expectedVersion === 0
            ? await one(
                db,
                `INSERT INTO fhdod.shift_schedules VALUES ($1,$2,$3,$4,1,$5,$6)
              ON CONFLICT (sector_id,attendance_date,shift) DO NOTHING
              RETURNING sector_id AS "sectorId",attendance_date AS date,shift,team,version`,
                [input.sectorId, input.date, input.shift, input.team.trim(), createdAt, user.id],
              )
            : await one(
                db,
                `UPDATE fhdod.shift_schedules SET team=$4,version=version+1,updated_at=$5,updated_by=$6
              WHERE sector_id=$1 AND attendance_date=$2 AND shift=$3 AND version=$7
              RETURNING sector_id AS "sectorId",attendance_date AS date,shift,team,version`,
                [
                  input.sectorId,
                  input.date,
                  input.shift,
                  input.team.trim(),
                  createdAt,
                  user.id,
                  input.expectedVersion,
                ],
              );
        if (!result) throw new Error('SCHEDULE_CONFLICT');
        await db.query('INSERT INTO fhdod.schedule_audit VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
          randomUUID(),
          input.sectorId,
          input.date,
          input.shift,
          user.id,
          input.expectedVersion,
          result.version,
          createdAt,
        ]);
        return result;
      });
    },
  };
}
