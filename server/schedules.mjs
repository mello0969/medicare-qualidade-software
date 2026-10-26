import { randomUUID } from 'node:crypto';
import { isSector } from '../src/domain.ts';
import { validAttendanceDate } from '../src/schedules.ts';
export { validAttendanceDate } from '../src/schedules.ts';

export const SCHEDULE_SHIFTS = ['manha', 'tarde', 'noite'];
export function todayInBrazil(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function validScheduleMonth(value) {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}
export function validScheduleInput(input) {
  return (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Object.keys(input).every((key) =>
      ['sectorId', 'date', 'shift', 'team', 'expectedVersion'].includes(key),
    ) &&
    isSector(input.sectorId) &&
    validAttendanceDate(input.date) &&
    SCHEDULE_SHIFTS.includes(input.shift) &&
    typeof input.team === 'string' &&
    input.team.trim().length >= 2 &&
    input.team.length <= 80 &&
    Number.isInteger(input.expectedVersion) &&
    input.expectedVersion >= 0 &&
    input.expectedVersion < 1_000_000
  );
}
export function requireScheduleWrite(input, user) {
  if (!validScheduleInput(input)) throw new Error('INVALID_SCHEDULE');
  if (
    user.role !== 'manager' &&
    !(user.role === 'sector-admin' && user.sectorId === input.sectorId)
  )
    throw new Error('FORBIDDEN_SECTOR');
}

export function initializeSchedules(db) {
  const columns = db.prepare('PRAGMA table_info(surveys)').all();
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='surveys'").get();
  if (
    !schema.sql.includes("'manha'") ||
    !columns.some((c) => c.name === 'attendance_date') ||
    !columns.some((c) => c.name === 'teams_json')
  ) {
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec(`CREATE TABLE surveys_schedules (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,payload_hash TEXT NOT NULL,
        nps INTEGER CHECK(nps IS NULL OR nps BETWEEN 0 AND 10), comment TEXT NOT NULL,
        shift TEXT NOT NULL CHECK(shift IN ('par','impar','nao-informado','manha','tarde','noite')),
        doctor TEXT NOT NULL,attendance_date TEXT,teams_json TEXT NOT NULL DEFAULT '[]'
      ) STRICT;
      INSERT INTO surveys_schedules (id,created_at,payload_hash,nps,comment,shift,doctor,attendance_date,teams_json)
        SELECT id,created_at,payload_hash,nps,comment,shift,doctor,
          ${columns.some((c) => c.name === 'attendance_date') ? 'attendance_date' : 'NULL'},
          ${columns.some((c) => c.name === 'teams_json') ? 'teams_json' : "'[]'"} FROM surveys;
      DROP TABLE surveys;ALTER TABLE surveys_schedules RENAME TO surveys;`);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('INVALID_MIGRATION');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.exec('PRAGMA foreign_keys=ON');
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS surveys_created_at ON surveys(created_at);
    CREATE TABLE IF NOT EXISTS shift_schedules (
      sector_id TEXT NOT NULL,attendance_date TEXT NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('manha','tarde','noite')),
      team TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),
      updated_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(sector_id,attendance_date,shift)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS schedule_audit (
      id TEXT PRIMARY KEY,sector_id TEXT NOT NULL,attendance_date TEXT NOT NULL,shift TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),previous_version INTEGER NOT NULL,
      next_version INTEGER NOT NULL,created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS schedules_month ON shift_schedules(attendance_date,sector_id);
    INSERT OR IGNORE INTO schema_version VALUES (6);`);
}

export function listSchedules(db, month, user) {
  if (!validScheduleMonth(month)) throw new Error('INVALID_SCHEDULE_MONTH');
  const scoped = user.role === 'sector-admin';
  return db
    .prepare(
      `SELECT sector_id AS sectorId,attendance_date AS date,shift,team,version
    FROM shift_schedules WHERE attendance_date LIKE ?${scoped ? ' AND sector_id=?' : ''}
    ORDER BY attendance_date,sector_id,shift`,
    )
    .all(...(scoped ? [`${month}-%`, user.sectorId] : [`${month}-%`]))
    .map((row) => ({ ...row }));
}
export function updateSchedule(db, input, user, createdAt) {
  requireScheduleWrite(input, user);
  const current = db
    .prepare(
      'SELECT version FROM shift_schedules WHERE sector_id=? AND attendance_date=? AND shift=?',
    )
    .get(input.sectorId, input.date, input.shift);
  if ((current?.version ?? 0) !== input.expectedVersion) throw new Error('SCHEDULE_CONFLICT');
  const version = input.expectedVersion + 1;
  db.prepare(
    `INSERT INTO shift_schedules VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(sector_id,attendance_date,shift) DO UPDATE SET
      team=excluded.team,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
  ).run(input.sectorId, input.date, input.shift, input.team.trim(), version, createdAt, user.id);
  db.prepare('INSERT INTO schedule_audit VALUES (?,?,?,?,?,?,?,?)').run(
    randomUUID(),
    input.sectorId,
    input.date,
    input.shift,
    user.id,
    input.expectedVersion,
    version,
    createdAt,
  );
  return {
    sectorId: input.sectorId,
    date: input.date,
    shift: input.shift,
    team: input.team.trim(),
    version,
  };
}
export function resolveScheduleTeams(db, response) {
  if (!response.attendanceDate || !SCHEDULE_SHIFTS.includes(response.shift)) return [];
  const read = db.prepare(
    'SELECT team,version FROM shift_schedules WHERE sector_id=? AND attendance_date=? AND shift=?',
  );
  return [...response.sectorIds].sort().flatMap((sectorId) => {
    const match = read.get(sectorId, response.attendanceDate, response.shift);
    return match ? [{ sectorId, name: match.team, scheduleVersion: match.version }] : [];
  });
}
export function publicSurveySchedule(row, user) {
  const teams = JSON.parse(row.teams_json ?? '[]').filter(
    (team) => user.role !== 'sector-admin' || team.sectorId === user.sectorId,
  );
  return {
    ...(row.attendance_date ? { attendanceDate: row.attendance_date } : {}),
    ...(teams.length ? { teams } : {}),
  };
}
