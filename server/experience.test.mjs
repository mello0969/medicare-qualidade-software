import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from './app.mjs';
import { createUser, openDatabase } from './store.mjs';
import { DEFAULT_QUESTIONS, DEFAULT_SETTINGS } from '../src/domain.ts';

const origin = 'http://127.0.0.1:5173';
const password = 'experience-test-password-2026';
const managerInput = {
  name: 'Administrador teste',
  email: 'admin@example.test',
  password,
  role: 'manager',
  sectorId: null,
};
const sectorInput = {
  name: 'Gestor da recepção',
  email: 'recepcao@example.test',
  password,
  role: 'sector-admin',
  sectorId: 'recepcao',
};

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'medicare-experience-test-'));
  const dbPath = join(directory, 'test.sqlite');
  const db = openDatabase(dbPath);
  await createUser(db, managerInput);
  await createUser(db, sectorInput);
  db.close();
  let server;
  let address;
  const start = async () => {
    server = createServer({ dbPath, origin });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    address = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    server.closeDatabase();
  };
  await start();
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = async (
    path,
    { method = 'GET', body, cookie, csrf, requestOrigin = origin } = {},
  ) => {
    const response = await fetch(`${address}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { Origin: requestOrigin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  };
  const login = async (email = managerInput.email) => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get('set-cookie').split(';')[0],
      csrf: response.data.csrfToken,
    };
  };
  return {
    request,
    login,
    dbPath,
    async restart() {
      await stop();
      await start();
    },
  };
}

const versions = (questions) => Object.fromEntries(questions.map((q) => [q.id, q.version]));
function survey({ questions = DEFAULT_QUESTIONS, rating = 2, ...overrides } = {}) {
  return {
    id: randomUUID(),
    createdAt: '2020-01-01T00:00:00.000Z',
    sectorIds: ['recepcao'],
    answers: questions
      .filter((q) => ['recepcao', 'geral'].includes(q.sectorId))
      .map((q) => ({
        questionId: q.id,
        questionVersion: q.version,
        questionText: q.text,
        sectorId: q.sectorId,
        value: rating,
      })),
    nps: 5,
    comment: '',
    shift: 'par',
    doctor: '',
    ...overrides,
  };
}
const contactInput = {
  name: 'Pessoa fictícia',
  phone: '(51) 99999-1234',
  email: 'ficticio@example.test',
  message: 'Gostaria de conversar sobre a espera no atendimento.',
  consent: true,
  settingsVersion: 1,
};

test('NPS is mandatory for new submissions, while all rating questions can be skipped and anonymous complaints remain optional', async (t) => {
  const { request, login } = await fixture(t);
  for (const nps of [null, undefined, -1, 11, 3.5, '9']) {
    const result = await request('/api/responses', { method: 'POST', body: survey({ nps }) });
    assert.equal(result.status, 400);
  }
  assert.equal(
    (await request('/api/responses', { method: 'POST', body: survey({ answers: [], nps: 0 }) }))
      .status,
    201,
  );
  assert.equal(
    (await request('/api/responses', { method: 'POST', body: survey({ nps: 10 }) })).status,
    201,
  );
  const logged = await login();
  assert.equal((await request('/api/responses', logged)).data.responses.length, 2);
  assert.deepEqual((await request('/api/admin/contacts', logged)).data.contacts, []);
});

test('General answers do not introduce a fictional department and sector managers see only their own ratings', async (t) => {
  const { request, login, dbPath, restart } = await fixture(t);
  const body = survey();
  assert.equal((await request('/api/responses', { method: 'POST', body })).status, 201);
  await restart();
  const manager = await login();
  const response = (await request('/api/responses', manager)).data.responses[0];
  assert.deepEqual(response.sectorIds, ['recepcao']);
  assert.ok(response.answers.some((answer) => answer.sectorId === 'geral'));
  const sector = await login(sectorInput.email);
  const scoped = (await request('/api/responses', sector)).data.responses[0];
  assert.ok(scoped.answers.every((answer) => answer.sectorId === 'recepcao'));
  const db = openDatabase(dbPath);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM survey_sectors WHERE sector_id = 'geral'").get()
      .count,
    0,
  );
  db.close();
});

test('Administrators can create general questions and sector managers can create only their own sector questions', async (t) => {
  const { request, login, dbPath } = await fixture(t);
  const manager = await login();
  const sector = await login(sectorInput.email);
  const input = { text: 'Como você avalia o acolhimento no hospital?', sectorId: 'geral' };
  assert.equal((await request('/api/questions', { method: 'POST', body: input })).status, 401);
  assert.equal(
    (await request('/api/questions', { ...manager, method: 'POST', body: input, csrf: undefined }))
      .status,
    403,
  );
  assert.equal(
    (await request('/api/questions', { ...sector, method: 'POST', body: input })).status,
    403,
  );
  assert.equal(
    (
      await request('/api/questions', {
        ...sector,
        method: 'POST',
        body: { ...input, sectorId: 'triagem' },
      })
    ).status,
    403,
  );
  const created = await request('/api/questions', { ...manager, method: 'POST', body: input });
  assert.equal(created.status, 201);
  assert.equal(created.data.question.version, 1);
  assert.match(created.data.question.id, /^[0-9a-f-]{36}$/);
  assert.equal(
    (
      await request('/api/questions', {
        ...sector,
        method: 'POST',
        body: { ...input, sectorId: 'recepcao' },
      })
    ).status,
    201,
  );
  const current = (await request('/api/questions')).data.questions;
  assert.equal(current.length, DEFAULT_QUESTIONS.length + 2);
  assert.ok(current.some((question) => question.id === created.data.question.id));
  assert.equal(
    (await request('/api/responses', { method: 'POST', body: survey({ questions: current }) }))
      .status,
    201,
  );
  const db = openDatabase(dbPath);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM question_audit WHERE previous_version = 0').get()
      .count,
    2,
  );
  db.close();
});

test('Question edits reject noncanonical sets, sector reassignment and stale forms after a question is added', async (t) => {
  const { request, login } = await fixture(t);
  const manager = await login();
  const body = { questions: DEFAULT_QUESTIONS, expectedVersions: versions(DEFAULT_QUESTIONS) };
  const reassigned = DEFAULT_QUESTIONS.map((q, i) => (i === 0 ? { ...q, sectorId: 'triagem' } : q));
  assert.equal(
    (
      await request('/api/questions', {
        ...manager,
        method: 'PUT',
        body: { ...body, questions: reassigned },
      })
    ).status,
    400,
  );
  const forged = DEFAULT_QUESTIONS.map((q, i) => (i === 0 ? { ...q, id: randomUUID() } : q));
  assert.equal(
    (
      await request('/api/questions', {
        ...manager,
        method: 'PUT',
        body: { questions: forged, expectedVersions: versions(forged) },
      })
    ).status,
    409,
  );
  await request('/api/questions', {
    ...manager,
    method: 'POST',
    body: { text: 'Como você avalia a comunicação durante o atendimento?', sectorId: 'geral' },
  });
  assert.equal((await request('/api/questions', { ...manager, method: 'PUT', body })).status, 409);
  const questions = (await request('/api/questions')).data.questions;
  const last = questions.at(-1);
  const updated = questions.map((q) =>
    q.id === last.id ? { ...q, text: 'Como você avalia as orientações durante o atendimento?' } : q,
  );
  const saved = await request('/api/questions', {
    ...manager,
    method: 'PUT',
    body: { questions: updated, expectedVersions: versions(questions) },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.questions.at(-1).version, 2);
});

test('Optional contact requests require a low rating, explicit consent, a published consent version and valid contact fields', async (t) => {
  const { request, login } = await fixture(t);
  const variants = [
    survey({ rating: 3, contactRequest: contactInput }),
    survey({ rating: 5, contactRequest: contactInput }),
    survey({ answers: [], contactRequest: contactInput }),
    survey({ contactRequest: { ...contactInput, consent: false } }),
    survey({ contactRequest: { ...contactInput, name: 'a' } }),
    survey({ contactRequest: { ...contactInput, phone: 'aaaaaaaaaaa' } }),
    survey({ contactRequest: { ...contactInput, phone: '() --- ..' } }),
    survey({ contactRequest: { ...contactInput, email: 'invalid' } }),
    survey({ contactRequest: { ...contactInput, message: 'short' } }),
    survey({ contactRequest: { ...contactInput, message: 'a'.repeat(1201) } }),
    survey({ contactRequest: { ...contactInput, settingsVersion: 999 } }),
    survey({ contactRequest: { ...contactInput, secretExtra: 'unrecognized' } }),
  ];
  for (const body of variants)
    assert.equal((await request('/api/responses', { method: 'POST', body })).status, 400);
  const logged = await login();
  assert.deepEqual((await request('/api/admin/contacts', logged)).data.contacts, []);
  // Invalid contact requests roll back the accompanying survey, not just its contact fields.
  assert.deepEqual((await request('/api/responses', logged)).data.responses, []);
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: survey({ rating: 1, contactRequest: { ...contactInput, email: '' } }),
      })
    ).status,
    201,
  );
});

test('Contact records are restricted to administrators and are never returned in analytics responses', async (t) => {
  const { request, login, restart } = await fixture(t);
  const body = survey({ contactRequest: contactInput });
  const posted = await request('/api/responses', { method: 'POST', body });
  assert.equal(posted.status, 201);
  assert.ok(!JSON.stringify(posted.data).includes(contactInput.phone));
  await restart();
  assert.equal((await request('/api/admin/contacts')).status, 401);
  const sector = await login(sectorInput.email);
  assert.equal((await request('/api/admin/contacts', sector)).status, 403);
  const manager = await login();
  const contacts = (await request('/api/admin/contacts', manager)).data.contacts;
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].surveyId, body.id);
  assert.equal(contacts[0].phone, contactInput.phone);
  assert.equal(contacts[0].status, 'novo');
  assert.equal(contacts[0].consentText, DEFAULT_SETTINGS.contactConsent);
  assert.deepEqual(contacts[0].sectorIds, ['recepcao']);
  for (const session of [manager, sector]) {
    const result = await request('/api/responses', session);
    assert.ok(!JSON.stringify(result.data).includes(contactInput.phone));
    assert.ok(!JSON.stringify(result.data).includes(contactInput.email));
    assert.ok(!JSON.stringify(result.data).includes(contactInput.message));
    assert.ok(!('contactRequest' in result.data.responses[0]));
  }
});

test('Idempotent submissions preserve one contact; changing or removing consent data on the same survey ID is rejected', async (t) => {
  const { request, login, dbPath } = await fixture(t);
  const body = survey({ contactRequest: contactInput });
  assert.equal((await request('/api/responses', { method: 'POST', body })).status, 201);
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: { ...body, createdAt: new Date().toISOString() },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: { ...body, contactRequest: { ...contactInput, phone: '51999991235' } },
      })
    ).status,
    409,
  );
  const { contactRequest: _contact, ...withoutContact } = body;
  assert.equal(
    (await request('/api/responses', { method: 'POST', body: withoutContact })).status,
    409,
  );
  const manager = await login();
  assert.equal((await request('/api/admin/contacts', manager)).data.contacts.length, 1);
  const db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM surveys').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM contact_requests').get().count, 1);
  db.close();
});

test('Only administrators can edit messages, concurrent edits are rejected and contacts retain the consent that was accepted', async (t) => {
  const { request, login, dbPath } = await fixture(t);
  const manager = await login();
  const sector = await login(sectorInput.email);
  assert.deepEqual((await request('/api/settings')).data.settings, DEFAULT_SETTINGS);
  const input = {
    settings: {
      ...DEFAULT_SETTINGS,
      contactConsent: 'Autorizo a ouvidoria a entrar em contato para ouvir minha manifestação.',
    },
    expectedVersion: 1,
  };
  assert.equal(
    (await request('/api/settings', { ...sector, method: 'PUT', body: input })).status,
    403,
  );
  assert.equal(
    (await request('/api/settings', { ...manager, method: 'PUT', body: input, csrf: undefined }))
      .status,
    403,
  );
  const changed = await request('/api/settings', { ...manager, method: 'PUT', body: input });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.settings.version, 2);
  assert.equal(
    (await request('/api/settings', { ...manager, method: 'PUT', body: input })).status,
    409,
  );
  // A survey opened before the edit may submit its historical published consent.
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: survey({ contactRequest: contactInput }),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request('/api/responses', {
        method: 'POST',
        body: survey({ contactRequest: { ...contactInput, settingsVersion: 2 } }),
      })
    ).status,
    201,
  );
  const contacts = (await request('/api/admin/contacts', manager)).data.contacts;
  assert.equal(
    contacts.find((contact) => contact.settingsVersion === 1).consentText,
    DEFAULT_SETTINGS.contactConsent,
  );
  assert.equal(
    contacts.find((contact) => contact.settingsVersion === 2).consentText,
    changed.data.settings.contactConsent,
  );
  const db = openDatabase(dbPath);
  const history = db
    .prepare('SELECT version, user_id FROM survey_settings_versions ORDER BY version')
    .all();
  assert.equal(history.length, 2);
  assert.ok(history[1].user_id);
  db.close();
});

test('Contact status changes require administrator access and CSRF and produce a minimal audit without contact contents', async (t) => {
  const { request, login, dbPath } = await fixture(t);
  await request('/api/responses', {
    method: 'POST',
    body: survey({ contactRequest: contactInput }),
  });
  const manager = await login();
  const sector = await login(sectorInput.email);
  const [contact] = (await request('/api/admin/contacts', manager)).data.contacts;
  const path = `/api/admin/contacts/${contact.id}`;
  assert.equal(
    (await request(path, { ...sector, method: 'PATCH', body: { status: 'em-analise' } })).status,
    403,
  );
  assert.equal(
    (
      await request(path, {
        ...manager,
        method: 'PATCH',
        body: { status: 'em-analise' },
        csrf: undefined,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(path, { ...manager, method: 'PATCH', body: { status: 'invalid' } })).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/admin/contacts/${randomUUID()}`, {
        ...manager,
        method: 'PATCH',
        body: { status: 'concluido' },
      })
    ).status,
    404,
  );
  const changed = await request(path, {
    ...manager,
    method: 'PATCH',
    body: { status: 'em-analise' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.contact.status, 'em-analise');
  assert.equal(
    (await request(path, { ...manager, method: 'PATCH', body: { status: 'concluido' } })).data
      .contact.status,
    'concluido',
  );
  const db = openDatabase(dbPath);
  const audit = db.prepare('SELECT * FROM contact_status_audit ORDER BY created_at').all();
  assert.deepEqual(
    audit.map((entry) => [entry.previous_status, entry.next_status]),
    [
      ['novo', 'em-analise'],
      ['em-analise', 'concluido'],
    ],
  );
  assert.ok(!JSON.stringify(audit).includes(contactInput.phone));
  db.close();
});

test('Settings validation rejects untrusted fields, weak text, invalid emails and forged versions without replacing published settings', async (t) => {
  const { request, login } = await fixture(t);
  const manager = await login();
  for (const settings of [
    { ...DEFAULT_SETTINGS, contactPrompt: 'a' },
    { ...DEFAULT_SETTINGS, contactConsent: 'a'.repeat(401) },
    { ...DEFAULT_SETTINGS, ombudsmanEmail: 'invalid-address' },
    { ...DEFAULT_SETTINGS, secretExtra: 'not-allowed' },
    { ...DEFAULT_SETTINGS, version: 100 },
  ]) {
    const result = await request('/api/settings', {
      ...manager,
      method: 'PUT',
      body: { settings, expectedVersion: 1 },
    });
    assert.ok([400, 409].includes(result.status));
  }
  assert.deepEqual((await request('/api/settings')).data.settings, DEFAULT_SETTINGS);
});

test('Upgrading the original schema preserves historical answers, edited questions, sessions and idempotent surveys while adding general questions', async (t) => {
  const { request, login, dbPath, restart } = await fixture(t);
  const manager = await login();
  const legacyQuestions = DEFAULT_QUESTIONS.filter((question) => question.sectorId !== 'geral');
  const response = survey({ questions: legacyQuestions });
  const posted = await request('/api/responses', { method: 'POST', body: response });
  assert.equal(posted.status, 201);
  const changed = DEFAULT_QUESTIONS.map((question, index) =>
    index === 0
      ? { ...question, text: 'A recepção explicou o próximo passo do seu atendimento?' }
      : question,
  );
  assert.equal(
    (
      await request('/api/questions', {
        ...manager,
        method: 'PUT',
        body: { questions: changed, expectedVersions: versions(DEFAULT_QUESTIONS) },
      })
    ).status,
    200,
  );
  const db = openDatabase(dbPath);
  // Reconstruct the original constraints and columns to exercise the actual persisted migration.
  db.exec(`
    DROP TABLE contact_status_audit;
    DROP TABLE contact_requests;
    DROP TABLE survey_settings_versions;
    DROP TABLE account_audit;
    ALTER TABLE users DROP COLUMN must_change_password;
    CREATE TABLE answers_original (
      survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      question_version INTEGER NOT NULL,
      sector_id TEXT NOT NULL,
      value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
      PRIMARY KEY (survey_id, question_id),
      FOREIGN KEY (question_id, question_version) REFERENCES question_versions(question_id, version),
      FOREIGN KEY (survey_id, sector_id) REFERENCES survey_sectors(survey_id, sector_id)
    ) STRICT;
    INSERT INTO answers_original SELECT * FROM answers;
    DROP TABLE answers;
    ALTER TABLE answers_original RENAME TO answers;
    DELETE FROM question_versions WHERE question_id IN (SELECT id FROM questions WHERE sector_id = 'geral');
    DELETE FROM questions WHERE sector_id = 'geral';
    DELETE FROM schema_version WHERE version >= 2;
  `);
  db.close();
  await restart();
  assert.equal((await request('/api/auth/session', manager)).data.user.mustChangePassword, false);
  const published = (await request('/api/questions')).data.questions;
  assert.equal(published.length, DEFAULT_QUESTIONS.length);
  assert.equal(published[0].text, changed[0].text);
  assert.equal(published[0].version, 2);
  const stored = (await request('/api/responses', manager)).data.responses;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].createdAt, posted.data.createdAt);
  assert.equal(
    stored[0].answers.find((answer) => answer.questionId === legacyQuestions[0].id).questionText,
    legacyQuestions[0].text,
  );
  assert.equal((await request('/api/responses', { method: 'POST', body: response })).status, 200);
  assert.equal(
    (await request('/api/responses', { method: 'POST', body: survey({ questions: published }) }))
      .status,
    201,
  );
  assert.deepEqual((await request('/api/settings')).data.settings, DEFAULT_SETTINGS);
});
