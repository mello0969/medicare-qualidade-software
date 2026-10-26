import { createServer as createHttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { validQuestions, validResponse } from '../src/validation.ts';
import { buildWallSummary } from '../src/wall.ts';
import { createRepository } from './repository.mjs';
import { validContactRequest } from './experience.mjs';
import { validAttendanceDate, todayInBrazil } from './schedules.mjs';

const COOKIE = 'medicare_session';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function reply(res, status, body) {
  if (status === 204) return res.writeHead(204).end();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function cookies(req) {
  const result = {};
  for (const pair of (req.headers.cookie ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator !== -1)
      result[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return result;
}

async function readBody(req, limit = 32 * 1024) {
  if ((req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new RequestError(415, 'JSON_REQUIRED', 'Envie os dados no formato JSON.');
  if (Number(req.headers['content-length']) > limit)
    throw new RequestError(413, 'BODY_TOO_LARGE', 'O envio excedeu o tamanho permitido.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new RequestError(413, 'BODY_TOO_LARGE', 'O envio excedeu o tamanho permitido.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'INVALID_JSON', 'Não foi possível ler os dados enviados.');
  }
}

export function clientAddress(req, trustVercel = process.env.VERCEL === '1') {
  // Vercel overwrites this platform-owned header. Arbitrary X-Forwarded-For is never trusted.
  const platformIp = req.headers['x-vercel-forwarded-for'];
  if (trustVercel && typeof platformIp === 'string' && isIP(platformIp)) return platformIp;
  return req.socket?.remoteAddress ?? 'unknown';
}

export function createHandler(options = {}) {
  const {
    dbPath = process.env.MEDICARE_DB_PATH ?? 'data/medicare.sqlite',
    // Explicit temporary dbPath fixtures must never inherit a production database URL.
    databaseUrl = Object.hasOwn(options, 'dbPath') ? '' : process.env.DATABASE_URL,
    repository,
    origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173',
    secureCookies = origin.startsWith('https://') || process.env.MEDICARE_SECURE_COOKIES === 'true',
    sessionTtlMs = 8 * 60 * 60 * 1000,
    loginLimit = 10,
    responseLimit = 60,
    rateWindowMs = 15 * 60 * 1000,
    now = Date.now,
    trustVercel = process.env.VERCEL === '1',
  } = options;
  const configured = new URL(origin);
  if (configured.origin !== origin || !['http:', 'https:'].includes(configured.protocol))
    throw new Error('APP_ORIGIN deve conter apenas protocolo, domínio e porta, sem caminho.');
  const initialRepository = repository ?? createRepository({ dbPath, databaseUrl });
  const initPromise = Promise.resolve(initialRepository);
  // Initialization errors are reported by each request, without an unhandled rejection.
  initPromise.catch(() => {});
  const sessionEnvelope = (session) => session ?? { user: null, csrfToken: null };
  const writeSessionCookie = (res, token, maxAge) =>
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`,
    );

  const handler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const repo = await initPromise;
      await repo.ready;
      const limit = async (key, maximum) => {
        const result = await repo.consumeRate(key, maximum, rateWindowMs, now());
        if (!result.allowed) {
          res.setHeader('Retry-After', String(result.retryAfter));
          throw new RequestError(
            429,
            'RATE_LIMIT',
            'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
          );
        }
      };
      const path = new URL(req.url, origin).pathname;
      const method = req.method;
      const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      // Browser writes must originate from the configured frontend, including login and public submissions.
      if (mutation && req.headers.origin !== origin)
        throw new RequestError(
          403,
          'INVALID_ORIGIN',
          'A origem desta solicitação não está autorizada.',
        );
      const token = cookies(req)[COOKIE];
      const session = await repo.readSession(token, now());
      const requireSession = () => {
        if (!session)
          throw new RequestError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
        return session;
      };
      const requirePasswordChanged = (logged) => {
        if (logged.user.mustChangePassword)
          throw new RequestError(
            403,
            'PASSWORD_CHANGE_REQUIRED',
            'Crie sua senha pessoal antes de acessar os dados do hospital.',
          );
        return logged;
      };
      const requireCsrf = (allowTemporary = false) => {
        const logged = requireSession();
        const supplied = req.headers['x-csrf-token'];
        const valid =
          typeof supplied === 'string' &&
          Buffer.byteLength(supplied) === Buffer.byteLength(logged.csrfToken) &&
          timingSafeEqual(Buffer.from(supplied), Buffer.from(logged.csrfToken));
        if (!valid)
          throw new RequestError(403, 'INVALID_CSRF', 'Atualize a página e tente novamente.');
        return allowTemporary ? logged : requirePasswordChanged(logged);
      };
      const requireManager = (csrf = false) => {
        const logged = csrf ? requireCsrf() : requirePasswordChanged(requireSession());
        if (logged.user.role !== 'manager')
          throw new RequestError(
            403,
            'MANAGER_REQUIRED',
            'Esta ação está disponível apenas para administradores do hospital.',
          );
        return logged;
      };
      const requireRole = (roles, csrf = false) => {
        const logged = csrf ? requireCsrf() : requirePasswordChanged(requireSession());
        if (!roles.includes(logged.user.role))
          throw new RequestError(
            403,
            'ROLE_REQUIRED',
            'Sua conta não tem permissão para esta ação.',
          );
        return logged;
      };
      const ip = clientAddress(req, trustVercel);

      if (method === 'GET' && path === '/api/health') return reply(res, 200, { ok: true });
      if (method === 'GET' && path === '/api/questions')
        return reply(res, 200, { questions: await repo.listQuestions() });
      if (method === 'GET' && path === '/api/settings')
        return reply(res, 200, { settings: await repo.readSettings() });
      if (method === 'GET' && path === '/api/wall') {
        const responses = await repo.listSurveys({ role: 'manager' });
        return reply(res, 200, { summary: buildWallSummary(responses, new Date(now())) });
      }
      if (method === 'GET' && path === '/api/auth/session')
        return reply(res, 200, sessionEnvelope(session));
      if (method === 'GET' && path === '/api/schedules') {
        const logged = requireRole(['manager', 'sector-admin', 'management']);
        const month = new URL(req.url, origin).searchParams.get('month');
        return reply(res, 200, { schedules: await repo.listSchedules(month, logged.user) });
      }
      if (method === 'PUT' && path === '/api/schedules') {
        const logged = requireRole(['manager', 'sector-admin'], true);
        const body = await readBody(req);
        const schedule = await repo.updateSchedule(
          body,
          logged.user,
          new Date(now()).toISOString(),
        );
        return reply(res, 200, { schedule });
      }

      if (method === 'POST' && path === '/api/auth/login') {
        await limit(`login:${ip}`, loginLimit);
        const body = await readBody(req);
        if (
          !exactKeys(body, ['email', 'password']) ||
          typeof body.email !== 'string' ||
          body.email.length > 254 ||
          typeof body.password !== 'string' ||
          body.password.length > 128
        )
          throw new RequestError(400, 'INVALID_LOGIN', 'Informe seu e-mail e sua senha.');
        const created = await repo.authenticate({
          email: body.email.trim().toLowerCase(),
          password: body.password,
          previousToken: token,
          now: now(),
          expiresAt: now() + sessionTtlMs,
        });
        writeSessionCookie(res, created.token, Math.floor(sessionTtlMs / 1000));
        return reply(res, 200, await repo.readSession(created.token, now()));
      }

      if (method === 'POST' && path === '/api/auth/logout') {
        requireCsrf(true);
        await repo.revokeSession(token);
        writeSessionCookie(res, '', 0);
        return reply(res, 204);
      }

      if (method === 'POST' && path === '/api/auth/password') {
        const logged = requireCsrf(true);
        await limit(`password:${ip}:${logged.user.id}`, 5);
        const body = await readBody(req);
        if (
          !exactKeys(body, ['currentPassword', 'newPassword']) ||
          typeof body.currentPassword !== 'string' ||
          body.currentPassword.length < 1 ||
          body.currentPassword.length > 128 ||
          typeof body.newPassword !== 'string' ||
          body.newPassword.length < 12 ||
          body.newPassword.length > 128
        )
          throw new RequestError(
            400,
            'INVALID_NEW_PASSWORD',
            'A nova senha deve ter entre 12 e 128 caracteres.',
          );
        if (body.newPassword === body.currentPassword)
          throw new RequestError(
            400,
            'UNCHANGED_PASSWORD',
            'Escolha uma senha diferente da senha atual.',
          );
        const created = await repo.changePassword({
          userId: logged.user.id,
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          sessionToken: token,
          expiresAt: now() + sessionTtlMs,
          now,
        });
        writeSessionCookie(res, created.token, Math.floor(sessionTtlMs / 1000));
        return reply(res, 200, await repo.readSession(created.token, now()));
      }

      if (method === 'POST' && path === '/api/responses') {
        if (session) requirePasswordChanged(session);
        await limit(`response:${ip}`, responseLimit);
        const body = await readBody(req);
        const valid =
          validResponse(body) &&
          uuid.test(body.id) &&
          Number.isInteger(body.nps) &&
          body.nps >= 0 &&
          body.nps <= 10 &&
          typeof body.shift === 'string' &&
          (body.attendanceDate === undefined ||
            (validAttendanceDate(body.attendanceDate) &&
              body.attendanceDate <= todayInBrazil(now()))) &&
          exactKeys(body, [
            'id',
            'createdAt',
            'sectorIds',
            'answers',
            'nps',
            'comment',
            'shift',
            'doctor',
            'contactRequest',
            'attendanceDate',
          ]) &&
          body.answers.every((answer) =>
            exactKeys(answer, [
              'questionId',
              'questionText',
              'questionVersion',
              'sectorId',
              'value',
            ]),
          ) &&
          (body.contactRequest === undefined ||
            validContactRequest(body.contactRequest, body.answers));
        if (!valid)
          throw new RequestError(400, 'INVALID_RESPONSE', 'Revise as respostas antes de enviar.');
        const saved = await repo.saveSurvey(body, new Date(now()).toISOString());
        return reply(res, saved.duplicate ? 200 : 201, {
          id: saved.id,
          createdAt: saved.createdAt,
        });
      }

      if (method === 'GET' && path === '/api/responses') {
        const logged = requireRole(['manager', 'sector-admin', 'management']);
        return reply(res, 200, { responses: await repo.listSurveys(logged.user) });
      }

      if (method === 'PUT' && path === '/api/questions') {
        const logged = requireRole(['manager', 'sector-admin'], true);
        const body = await readBody(req);
        if (
          !exactKeys(body, ['questions', 'expectedVersions']) ||
          !validQuestions(body.questions) ||
          !exactKeys(
            body.expectedVersions,
            body.questions.map((q) => q.id),
          ) ||
          Object.values(body.expectedVersions).some((v) => !Number.isInteger(v) || v < 1) ||
          body.questions.some((q) => !exactKeys(q, ['id', 'sectorId', 'text', 'version']))
        )
          throw new RequestError(
            400,
            'INVALID_QUESTIONS',
            'Revise as perguntas e tente novamente.',
          );
        const questions = await repo.updateQuestions(
          body.questions,
          body.expectedVersions,
          logged.user,
          new Date(now()).toISOString(),
        );
        return reply(res, 200, { questions });
      }

      if (method === 'POST' && path === '/api/questions') {
        const logged = requireRole(['manager', 'sector-admin'], true);
        const body = await readBody(req);
        if (!exactKeys(body, ['text', 'sectorId'])) throw new Error('INVALID_QUESTIONS');
        const question = await repo.createQuestion(
          body,
          logged.user,
          new Date(now()).toISOString(),
        );
        return reply(res, 201, { question });
      }

      if (method === 'PUT' && path === '/api/settings') {
        const logged = requireManager(true);
        const body = await readBody(req);
        if (!exactKeys(body, ['settings', 'expectedVersion'])) throw new Error('INVALID_SETTINGS');
        const settings = await repo.updateSettings(
          body.settings,
          body.expectedVersion,
          logged.user.id,
          new Date(now()).toISOString(),
        );
        return reply(res, 200, { settings });
      }

      if (method === 'GET' && path === '/api/admin/contacts') {
        requireRole(['manager', 'ombudsman']);
        return reply(res, 200, { contacts: await repo.listContacts() });
      }

      const contactPath = /^\/api\/admin\/contacts\/([^/]+)$/.exec(path);
      if (method === 'PATCH' && contactPath) {
        const logged = requireRole(['manager', 'ombudsman'], true);
        const body = await readBody(req);
        if (!exactKeys(body, ['status'])) throw new Error('INVALID_CONTACT_STATUS');
        const contact = await repo.updateContactStatus(
          contactPath[1],
          body.status,
          logged.user.id,
          new Date(now()).toISOString(),
        );
        return reply(res, 200, { contact });
      }

      if (method === 'GET' && path === '/api/admin/users') {
        requireManager();
        const users = await repo.listUsers();
        return reply(res, 200, { users });
      }

      if (method === 'POST' && path === '/api/admin/users') {
        const logged = requireManager(true);
        await limit(`users:${ip}`, 20);
        const body = await readBody(req);
        if (!exactKeys(body, ['name', 'email', 'password', 'role', 'sectorId']))
          throw new Error('INVALID_USER');
        const user = await repo.createUser(
          { ...body, mustChangePassword: true },
          now(),
          logged.user.id,
        );
        return reply(res, 201, { user });
      }

      throw new RequestError(404, 'NOT_FOUND', 'Este recurso não foi encontrado.');
    } catch (error) {
      if (res.writableEnded || res.destroyed) return;
      const mapped = {
        INVALID_SCHEDULE: [
          400,
          'INVALID_SCHEDULE',
          'Revise o setor, a data, o turno e a equipe da escala.',
        ],
        INVALID_SCHEDULE_MONTH: [
          400,
          'INVALID_SCHEDULE_MONTH',
          'Informe um mês válido no formato AAAA-MM.',
        ],
        SCHEDULE_CONFLICT: [
          409,
          'VERSION_CONFLICT',
          'Esta escala foi alterada por outra pessoa. Recarregue antes de salvar.',
        ],
        INVALID_CREDENTIALS: [401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'],
        ID_CONFLICT: [409, 'ID_CONFLICT', 'Este envio já existe com respostas diferentes.'],
        INVALID_QUESTION_SNAPSHOT: [
          400,
          'INVALID_QUESTION_SNAPSHOT',
          'Uma pergunta não corresponde à versão publicada. Atualize a pesquisa.',
        ],
        FORBIDDEN_SECTOR: [
          403,
          'FORBIDDEN_SECTOR',
          'Você pode editar somente as perguntas do seu setor.',
        ],
        VERSION_CONFLICT: [
          409,
          'VERSION_CONFLICT',
          'As perguntas foram atualizadas por outra pessoa. Recarregue antes de salvar.',
        ],
        INVALID_USER: [
          400,
          'INVALID_USER',
          'Revise os dados. A senha deve ter entre 12 e 128 caracteres.',
        ],
        DUPLICATE_USER: [409, 'DUPLICATE_USER', 'Já existe uma conta com este e-mail.'],
        INVALID_PASSWORD: [400, 'INVALID_PASSWORD', 'A senha atual está incorreta.'],
        SESSION_STALE: [401, 'AUTH_REQUIRED', 'Sua sessão foi encerrada. Entre novamente.'],
        INVALID_QUESTIONS: [400, 'INVALID_QUESTIONS', 'Revise as perguntas e tente novamente.'],
        QUESTION_SET_CHANGED: [
          409,
          'VERSION_CONFLICT',
          'A lista de perguntas foi alterada. Recarregue antes de salvar.',
        ],
        QUESTION_LIMIT: [409, 'QUESTION_LIMIT', 'O limite de 60 perguntas foi atingido.'],
        INVALID_SETTINGS: [400, 'INVALID_SETTINGS', 'Revise os textos e o e-mail da ouvidoria.'],
        SETTINGS_CONFLICT: [
          409,
          'VERSION_CONFLICT',
          'As mensagens foram atualizadas por outra pessoa. Recarregue antes de salvar.',
        ],
        INVALID_SETTINGS_VERSION: [
          400,
          'INVALID_SETTINGS_VERSION',
          'O consentimento não corresponde a uma versão publicada. Atualize a pesquisa.',
        ],
        INVALID_CONTACT_STATUS: [
          400,
          'INVALID_CONTACT_STATUS',
          'Escolha um status válido para o pedido.',
        ],
        CONTACT_NOT_FOUND: [404, 'CONTACT_NOT_FOUND', 'Este pedido de contato não foi encontrado.'],
      }[error.message];
      if (mapped) return reply(res, mapped[0], { code: mapped[1], error: mapped[2] });
      if (error instanceof RequestError)
        return reply(res, error.status, { code: error.code, error: error.message });
      // Do not leak database internals, submitted answers, account data, or credentials.
      console.error('Falha interna na API MediCare:', error.code ?? error.name);
      return reply(res, 500, {
        code: 'INTERNAL_ERROR',
        error: 'Não foi possível concluir. Tente novamente em instantes.',
      });
    }
  };
  handler.closeDatabase = () =>
    initialRepository.then ? initPromise.then((repo) => repo.close()) : initialRepository.close();
  return handler;
}

export function createServer(options = {}) {
  const handler = createHandler(options);
  const server = createHttpServer(handler);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.closeDatabase = handler.closeDatabase;
  return server;
}
