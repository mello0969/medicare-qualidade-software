import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { DEFAULT_QUESTIONS, isSector } from '../src/domain.ts';
import { initializeExperience, recordContact } from './experience.mjs';

const deriveKey = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  sectorId: user.sector_id ?? null,
  mustChangePassword: Boolean(user.must_change_password),
});

export function openDatabase(dbPath = 'data/medicare.sqlite') {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY) STRICT;
    INSERT OR IGNORE INTO schema_version VALUES (1);
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL,
      current_version INTEGER NOT NULL CHECK (current_version > 0)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS question_versions (
      question_id TEXT NOT NULL REFERENCES questions(id),
      version INTEGER NOT NULL CHECK (version > 0),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (question_id, version)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      nps INTEGER CHECK (nps IS NULL OR nps BETWEEN 0 AND 10),
      comment TEXT NOT NULL,
      shift TEXT NOT NULL CHECK (shift IN ('par', 'impar', 'nao-informado')),
      doctor TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS survey_sectors (
      survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      sector_id TEXT NOT NULL,
      PRIMARY KEY (survey_id, sector_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS answers (
      survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      question_version INTEGER NOT NULL,
      sector_id TEXT NOT NULL,
      value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
      PRIMARY KEY (survey_id, question_id),
      FOREIGN KEY (question_id, question_version) REFERENCES question_versions(question_id, version)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      role TEXT NOT NULL CHECK (role IN ('manager', 'sector-admin')),
      sector_id TEXT,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
      CHECK ((role = 'manager' AND sector_id IS NULL) OR (role = 'sector-admin' AND sector_id IS NOT NULL))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS question_audit (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      previous_version INTEGER NOT NULL,
      next_version INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS account_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      actor_id TEXT REFERENCES users(id),
      event TEXT NOT NULL CHECK (event IN ('user_created', 'password_changed')),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS surveys_created_at ON surveys(created_at);
    CREATE INDEX IF NOT EXISTS sector_surveys ON survey_sectors(sector_id, survey_id);
    CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
  `);
  // Existing accounts retain their access. Only newly issued temporary passwords require a change.
  transaction(db, () => {
    const columns = db.prepare('PRAGMA table_info(users)').all();
    if (!columns.some((column) => column.name === 'must_change_password'))
      db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL
        DEFAULT 0 CHECK (must_change_password IN (0, 1))`);
    db.prepare('INSERT OR IGNORE INTO schema_version VALUES (?)').run(2);
    const answerKeys = db.prepare('PRAGMA foreign_key_list(answers)').all();
    if (answerKeys.some((key) => key.table === 'survey_sectors')) {
      // General hospital questions do not create a fictional department in survey_sectors.
      db.exec(`CREATE TABLE answers_general (
        survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        question_version INTEGER NOT NULL,
        sector_id TEXT NOT NULL,
        value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
        PRIMARY KEY (survey_id, question_id),
        FOREIGN KEY (question_id, question_version) REFERENCES question_versions(question_id, version)
      ) STRICT;
      INSERT INTO answers_general SELECT * FROM answers;
      DROP TABLE answers;
      ALTER TABLE answers_general RENAME TO answers;`);
    }
    db.prepare('INSERT OR IGNORE INTO schema_version VALUES (?)').run(3);
  });
  transaction(db, () => {
    const addQuestion = db.prepare('INSERT OR IGNORE INTO questions VALUES (?, ?, ?)');
    const addVersion = db.prepare('INSERT OR IGNORE INTO question_versions VALUES (?, ?, ?, ?)');
    for (const question of DEFAULT_QUESTIONS) {
      addQuestion.run(question.id, question.sectorId, 1);
      addVersion.run(question.id, 1, question.text, new Date().toISOString());
    }
  });
  initializeExperience(db);
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listQuestions(db) {
  const rows = db
    .prepare(
      `SELECT q.id, q.sector_id AS sectorId,
    v.text, q.current_version AS version FROM questions q
    JOIN question_versions v ON v.question_id = q.id AND v.version = q.current_version
    ORDER BY q.rowid`,
    )
    .all();
  return rows.map((row) => ({ ...row }));
}

export function userInputValid(input) {
  return (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Object.keys(input).every((key) =>
      ['name', 'email', 'password', 'role', 'sectorId', 'mustChangePassword'].includes(key),
    ) &&
    typeof input.name === 'string' &&
    input.name.trim().length >= 2 &&
    input.name.trim().length <= 80 &&
    typeof input.email === 'string' &&
    input.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) &&
    typeof input.password === 'string' &&
    input.password.length >= 12 &&
    input.password.length <= 128 &&
    (input.mustChangePassword === undefined || typeof input.mustChangePassword === 'boolean') &&
    ((input.role === 'manager' && input.sectorId === null) ||
      (input.role === 'sector-admin' && isSector(input.sectorId)))
  );
}

export async function createUser(db, input, now = Date.now(), actorId = null) {
  if (!userInputValid(input)) throw new Error('INVALID_USER');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await deriveKey(input.password, salt, 64, scryptOptions)).toString('hex');
  const user = {
    id: randomUUID(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    sector_id: input.sectorId,
    must_change_password: input.mustChangePassword ? 1 : 0,
  };
  const createdAt = new Date(now).toISOString();
  // SAVEPOINT keeps setup scripts that already own a transaction atomic as well.
  db.exec('SAVEPOINT create_user');
  try {
    db.prepare(
      `INSERT INTO users
      (id, name, email, role, sector_id, password_salt, password_hash, created_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user.id,
      user.name,
      user.email,
      user.role,
      user.sector_id,
      salt,
      passwordHash,
      createdAt,
      user.must_change_password,
    );
    db.prepare('INSERT INTO account_audit VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      user.id,
      actorId,
      'user_created',
      createdAt,
    );
    db.exec('RELEASE create_user');
  } catch (error) {
    db.exec('ROLLBACK TO create_user');
    db.exec('RELEASE create_user');
    if (error.code === 'ERR_SQLITE_ERROR' && error.message.includes('UNIQUE constraint'))
      throw new Error('DUPLICATE_USER');
    throw error;
  }
  return publicUser(user);
}

// The same derivation is performed for unknown accounts, avoiding a cheap enumeration path.
const dummySalt = randomBytes(16).toString('hex');
const dummyHash = scryptSync(randomBytes(32), dummySalt, 64, scryptOptions).toString('hex');
export async function verifyPassword(password, user) {
  const salt = user?.password_salt ?? dummySalt;
  const expected = Buffer.from(user?.password_hash ?? dummyHash, 'hex');
  const actual = await deriveKey(password, salt, 64, scryptOptions);
  return timingSafeEqual(actual, expected) && Boolean(user);
}

export async function changePassword(
  db,
  { userId, currentPassword, newPassword, sessionToken, expiresAt, now = Date.now },
) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!(await verifyPassword(currentPassword, user))) throw new Error('INVALID_PASSWORD');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await deriveKey(newPassword, salt, 64, scryptOptions)).toString('hex');
  return transaction(db, () => {
    // Verification is asynchronous: recheck both account and session before applying its result.
    const current = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    const session = readSession(db, sessionToken, now());
    if (!current || current.password_hash !== user.password_hash || session?.user.id !== userId)
      throw new Error('SESSION_STALE');
    db.prepare(
      `UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 0
      WHERE id = ?`,
    ).run(salt, passwordHash, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    const created = createSession(db, userId, expiresAt);
    db.prepare('INSERT INTO account_audit VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      userId,
      userId,
      'password_changed',
      new Date(now()).toISOString(),
    );
    return created;
  });
}

export function createSession(db, userId, expiresAt) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(
    tokenHash(token),
    userId,
    csrfToken,
    expiresAt,
  );
  return { token, csrfToken };
}

export function readSession(db, token, now) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = db
    .prepare(
      `SELECT u.*, s.csrf_token, s.expires_at FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash(token), now);
  return row ? { user: publicUser(row), csrfToken: row.csrf_token } : null;
}

export function responseHash(response) {
  const canonical = {
    id: response.id,
    sectorIds: [...response.sectorIds].sort(),
    answers: response.answers
      .map((a) => ({
        questionId: a.questionId,
        questionText: a.questionText,
        questionVersion: a.questionVersion,
        sectorId: a.sectorId,
        value: a.value,
      }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId)),
    nps: response.nps,
    comment: response.comment,
    shift: response.shift,
    doctor: response.doctor,
  };
  if (response.contactRequest) {
    const contact = response.contactRequest;
    canonical.contactRequest = {
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      message: contact.message,
      consent: contact.consent,
      settingsVersion: contact.settingsVersion,
    };
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function saveSurvey(db, response, createdAt) {
  const hash = responseHash(response);
  const existing = db
    .prepare('SELECT id, created_at, payload_hash FROM surveys WHERE id = ?')
    .get(response.id);
  if (existing) {
    if (existing.payload_hash !== hash) throw new Error('ID_CONFLICT');
    return { id: existing.id, createdAt: existing.created_at, duplicate: true };
  }
  transaction(db, () => {
    // The submitted snapshots must match a published historical version exactly.
    const history = db.prepare(`SELECT q.sector_id, v.text FROM question_versions v
      JOIN questions q ON q.id = v.question_id WHERE v.question_id = ? AND v.version = ?`);
    for (const answer of response.answers) {
      const question = history.get(answer.questionId, answer.questionVersion);
      if (
        !question ||
        question.sector_id !== answer.sectorId ||
        question.text !== answer.questionText ||
        (answer.sectorId !== 'geral' && !response.sectorIds.includes(answer.sectorId))
      )
        throw new Error('INVALID_QUESTION_SNAPSHOT');
    }
    db.prepare('INSERT INTO surveys VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      response.id,
      createdAt,
      hash,
      response.nps,
      response.comment,
      response.shift,
      response.doctor,
    );
    const addSector = db.prepare('INSERT INTO survey_sectors VALUES (?, ?)');
    for (const sector of response.sectorIds) addSector.run(response.id, sector);
    const addAnswer = db.prepare('INSERT INTO answers VALUES (?, ?, ?, ?, ?)');
    for (const answer of response.answers)
      addAnswer.run(
        response.id,
        answer.questionId,
        answer.questionVersion,
        answer.sectorId,
        answer.value,
      );
    if (response.contactRequest) recordContact(db, response, createdAt);
  });
  return { id: response.id, createdAt, duplicate: false };
}

export function listSurveys(db, user) {
  const scoped = user.role === 'sector-admin';
  const rows = scoped
    ? db
        .prepare(
          `SELECT s.* FROM surveys s JOIN survey_sectors ss ON ss.survey_id = s.id
      WHERE ss.sector_id = ? ORDER BY s.created_at DESC, s.id`,
        )
        .all(user.sectorId)
    : db.prepare('SELECT * FROM surveys ORDER BY created_at DESC, id').all();
  const sectors = db.prepare(
    'SELECT sector_id FROM survey_sectors WHERE survey_id = ? ORDER BY sector_id',
  );
  const answerQuery =
    db.prepare(`SELECT a.question_id AS questionId, a.question_version AS questionVersion,
    v.text AS questionText, a.sector_id AS sectorId, a.value FROM answers a JOIN question_versions v
    ON v.question_id = a.question_id AND v.version = a.question_version
    WHERE a.survey_id = ? ORDER BY a.question_id`);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    sectorIds: scoped ? [user.sectorId] : sectors.all(row.id).map((s) => s.sector_id),
    answers: answerQuery
      .all(row.id)
      .filter((answer) => !scoped || answer.sectorId === user.sectorId),
    nps: row.nps,
    // An unstructured comment may describe other departments; only the hospital manager can read it.
    comment: scoped ? '' : row.comment,
    shift: row.shift,
    doctor: scoped && user.sectorId !== 'medico' ? '' : row.doctor,
  }));
}

export function updateQuestions(db, questions, expectedVersions, user, createdAt) {
  return transaction(db, () => {
    const current = listQuestions(db);
    if (
      questions.length !== current.length ||
      questions.some((question) => !current.some((old) => old.id === question.id))
    )
      throw new Error('QUESTION_SET_CHANGED');
    for (const question of questions) {
      const old = current.find((q) => q.id === question.id);
      if (question.sectorId !== old.sectorId) throw new Error('INVALID_QUESTIONS');
      const own = user.role === 'manager' || question.sectorId === user.sectorId;
      if (!own && (question.text !== old.text || question.version !== old.version))
        throw new Error('FORBIDDEN_SECTOR');
      if (own && expectedVersions[question.id] !== old.version) throw new Error('VERSION_CONFLICT');
      if (own && question.version !== old.version && question.version !== old.version + 1)
        throw new Error('VERSION_CONFLICT');
    }
    const addVersion = db.prepare('INSERT INTO question_versions VALUES (?, ?, ?, ?)');
    const changeCurrent = db.prepare('UPDATE questions SET current_version = ? WHERE id = ?');
    const audit = db.prepare('INSERT INTO question_audit VALUES (?, ?, ?, ?, ?, ?)');
    for (const question of questions) {
      const old = current.find((q) => q.id === question.id);
      if (question.text === old.text) continue;
      const nextVersion = old.version + 1;
      addVersion.run(question.id, nextVersion, question.text, createdAt);
      changeCurrent.run(nextVersion, question.id);
      audit.run(randomUUID(), question.id, user.id, old.version, nextVersion, createdAt);
    }
    return listQuestions(db);
  });
}

export function createQuestion(db, input, user, createdAt) {
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
  return transaction(db, () => {
    if (listQuestions(db).length >= 60) throw new Error('QUESTION_LIMIT');
    const question = {
      id: randomUUID(),
      sectorId: input.sectorId,
      text: input.text.trim(),
      version: 1,
    };
    db.prepare('INSERT INTO questions VALUES (?, ?, ?)').run(question.id, question.sectorId, 1);
    db.prepare('INSERT INTO question_versions VALUES (?, ?, ?, ?)').run(
      question.id,
      1,
      question.text,
      createdAt,
    );
    db.prepare('INSERT INTO question_audit VALUES (?, ?, ?, ?, ?, ?)').run(
      randomUUID(),
      question.id,
      user.id,
      0,
      1,
      createdAt,
    );
    return question;
  });
}
