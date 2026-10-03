import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../src/domain.ts';

const fields = [
  'version',
  'contactPrompt',
  'contactConsent',
  'confirmationText',
  'successText',
  'ombudsmanEmail',
];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) =>
  object(value) && Object.keys(value).every((key) => keys.includes(key));
const email = (value) =>
  typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const boundedText = (value, min, max) =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max;

export function initializeExperience(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS survey_settings_versions (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_id TEXT REFERENCES users(id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS contact_requests (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL UNIQUE REFERENCES surveys(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      settings_version INTEGER NOT NULL REFERENCES survey_settings_versions(version),
      consent_text TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('novo', 'em-analise', 'concluido'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS contact_status_audit (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contact_requests(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      previous_status TEXT NOT NULL,
      next_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS contacts_created_at ON contact_requests(created_at);
    CREATE INDEX IF NOT EXISTS contacts_status ON contact_requests(status);
  `);
  db.prepare('INSERT OR IGNORE INTO survey_settings_versions VALUES (?, ?, ?, ?)').run(
    DEFAULT_SETTINGS.version,
    JSON.stringify(DEFAULT_SETTINGS),
    new Date().toISOString(),
    null,
  );
  db.prepare('INSERT OR IGNORE INTO schema_version VALUES (?)').run(4);
}

export function validSettings(settings) {
  return (
    exactKeys(settings, fields) &&
    Number.isInteger(settings.version) &&
    settings.version >= 1 &&
    settings.version <= 1_000_000 &&
    ['contactPrompt', 'contactConsent', 'confirmationText', 'successText'].every((field) =>
      boundedText(settings[field], 8, 400),
    ) &&
    email(settings.ombudsmanEmail)
  );
}

export function readSettings(db, version) {
  const row =
    version === undefined
      ? db
          .prepare(
            'SELECT settings_json FROM survey_settings_versions ORDER BY version DESC LIMIT 1',
          )
          .get()
      : db
          .prepare('SELECT settings_json FROM survey_settings_versions WHERE version = ?')
          .get(version);
  return row ? JSON.parse(row.settings_json) : null;
}

// The caller owns the transaction so a concurrent settings change cannot be overwritten.
export function updateSettings(db, input, expectedVersion, userId, createdAt) {
  if (!validSettings(input) || !Number.isInteger(expectedVersion) || expectedVersion < 1)
    throw new Error('INVALID_SETTINGS');
  const current = readSettings(db);
  if (
    expectedVersion !== current.version ||
    ![current.version, current.version + 1].includes(input.version)
  )
    throw new Error('SETTINGS_CONFLICT');
  const next = Object.fromEntries(
    fields.map((field) => [field, field === 'version' ? current.version : input[field].trim()]),
  );
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  next.version = current.version + 1;
  db.prepare('INSERT INTO survey_settings_versions VALUES (?, ?, ?, ?)').run(
    next.version,
    JSON.stringify(next),
    createdAt,
    userId,
  );
  return next;
}

export function validContactRequest(contact, answers) {
  return (
    exactKeys(contact, ['name', 'phone', 'email', 'message', 'consent', 'settingsVersion']) &&
    boundedText(contact.name, 2, 80) &&
    boundedText(contact.phone, 8, 20) &&
    /^[+\d\s().-]+$/.test(contact.phone) &&
    contact.phone.replace(/\D/g, '').length >= 8 &&
    (contact.email === undefined || contact.email === '' || email(contact.email)) &&
    boundedText(contact.message, 10, 1200) &&
    contact.consent === true &&
    Number.isInteger(contact.settingsVersion) &&
    contact.settingsVersion >= 1 &&
    contact.settingsVersion <= 1_000_000 &&
    answers.some((answer) => answer.value <= 2)
  );
}

export function recordContact(db, response, createdAt) {
  const input = response.contactRequest;
  const settings = readSettings(db, input.settingsVersion);
  if (!settings) throw new Error('INVALID_SETTINGS_VERSION');
  db.prepare(
    `INSERT INTO contact_requests
    (id, survey_id, created_at, name, phone, email, message, settings_version, consent_text, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    response.id,
    createdAt,
    input.name.trim(),
    input.phone.trim(),
    (input.email ?? '').trim().toLowerCase(),
    input.message.trim(),
    input.settingsVersion,
    settings.contactConsent,
    'novo',
  );
}

function publicContact(db, row) {
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
    sectorIds: db
      .prepare('SELECT sector_id FROM survey_sectors WHERE survey_id = ? ORDER BY sector_id')
      .all(row.survey_id)
      .map((sector) => sector.sector_id),
  };
}

export function listContacts(db) {
  return db
    .prepare('SELECT * FROM contact_requests ORDER BY created_at DESC, id')
    .all()
    .map((row) => publicContact(db, row));
}

export function updateContactStatus(db, id, status, userId, createdAt) {
  if (!['novo', 'em-analise', 'concluido'].includes(status))
    throw new Error('INVALID_CONTACT_STATUS');
  const contact = db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(id);
  if (!contact) throw new Error('CONTACT_NOT_FOUND');
  if (contact.status !== status) {
    db.prepare('UPDATE contact_requests SET status = ? WHERE id = ?').run(status, id);
    db.prepare('INSERT INTO contact_status_audit VALUES (?, ?, ?, ?, ?, ?)').run(
      randomUUID(),
      id,
      userId,
      contact.status,
      status,
      createdAt,
    );
  }
  return publicContact(db, { ...contact, status });
}
