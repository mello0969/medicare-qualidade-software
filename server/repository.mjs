import * as store from './store.mjs';
import * as experience from './experience.mjs';
import * as schedules from './schedules.mjs';

// Both implementations expose the same application operations; SQLite SQL stays local.
export function createSqliteRepository(dbPath) {
  const db = store.openDatabase(dbPath);
  const buckets = new Map();
  return {
    kind: 'sqlite',
    ready: Promise.resolve(),
    close: () => db.close(),
    listQuestions: () => store.listQuestions(db),
    readSettings: () => experience.readSettings(db),
    readSession: (token, now) => store.readSession(db, token, now),
    async authenticate({ email, password, previousToken, now, expiresAt }) {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!(await store.verifyPassword(password, user))) throw new Error('INVALID_CREDENTIALS');
      return store.transaction(db, () => {
        const current = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
        if (current?.password_hash !== user.password_hash) throw new Error('INVALID_CREDENTIALS');
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
        if (previousToken)
          db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
            store.tokenHash(previousToken),
          );
        return store.createSession(db, user.id, expiresAt);
      });
    },
    revokeSession: (token) =>
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(store.tokenHash(token)),
    changePassword: (input) => store.changePassword(db, input),
    saveSurvey: (response, createdAt) => store.saveSurvey(db, response, createdAt),
    listSurveys: (user) => store.listSurveys(db, user),
    updateQuestions: (...args) => store.updateQuestions(db, ...args),
    createQuestion: (...args) => store.createQuestion(db, ...args),
    updateSettings: (...args) =>
      store.transaction(db, () => experience.updateSettings(db, ...args)),
    listContacts: () => experience.listContacts(db),
    updateContactStatus: (...args) =>
      store.transaction(db, () => experience.updateContactStatus(db, ...args)),
    listUsers: () => db.prepare('SELECT * FROM users ORDER BY name').all().map(store.publicUser),
    createUser: (...args) => store.createUser(db, ...args),
    listSchedules: (...args) => schedules.listSchedules(db, ...args),
    updateSchedule: (...args) => store.transaction(db, () => schedules.updateSchedule(db, ...args)),
    consumeRate(key, maximum, windowMs, now) {
      for (const [oldKey, bucket] of buckets) if (bucket.until <= now) buckets.delete(oldKey);
      if (!buckets.has(key) && buckets.size >= 10000)
        return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
      const bucket = buckets.get(key) ?? { count: 0, until: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      return {
        allowed: bucket.count <= maximum,
        retryAfter: Math.max(1, Math.ceil((bucket.until - now) / 1000)),
      };
    },
  };
}

export function createRepository({ dbPath, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl) {
    return import('./postgres.mjs').then(({ createPostgresRepository }) =>
      createPostgresRepository({ connectionString: databaseUrl }),
    );
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL_REQUIRED');
  return createSqliteRepository(dbPath);
}
