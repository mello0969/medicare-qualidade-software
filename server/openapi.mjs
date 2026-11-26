import { SECTORS, SHIFT_LABELS, FEEDBACK, ORIGINS, DEFAULT_SETTINGS } from '../src/domain.ts';

const ref = (name) => ({ $ref: '#/components/schemas/' + name });
const str = { type: 'string' };
const text = (minLength, maxLength) => ({ type: 'string', minLength, maxLength });
const integer = (minimum, maximum) => ({
  type: 'integer',
  minimum,
  ...(maximum === undefined ? {} : { maximum }),
});
const list = (items) => ({ type: 'array', items });
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const enumeration = (values) => ({ type: 'string', enum: values });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const date = { type: 'string', format: 'date' };
const timestamp = { type: 'string', format: 'date-time' };
const id = { type: 'string', format: 'uuid' };
const bool = { type: 'boolean' };
const version = integer(1, 1000000);
const sector = enumeration(SECTORS.map((s) => s.id));
const questionnaire = enumeration(['geral', ...sector.enum]);
const shift = enumeration(Object.keys(SHIFT_LABELS));
const role = enumeration(['manager', 'sector-admin', 'management', 'ombudsman', 'viewer']);
const status = enumeration(['novo', 'em-analise', 'concluido']);
const credentials = {
  email: { type: 'string', format: 'email', maxLength: 254 },
  password: { ...text(12, 128), format: 'password', writeOnly: true },
};
const userFields = {
  name: text(2, 80),
  email: credentials.email,
  role,
  sectorId: nullable(sector),
};
const surveyFields = {
  id,
  createdAt: timestamp,
  sectorIds: { ...list(sector), minItems: 1, maxItems: 6, uniqueItems: true },
  answers: { ...list(ref('Answer')), maxItems: 60 },
  nps: integer(0, 10),
  comment: text(0, 600),
  shift,
  doctor: text(0, 40),
  attendanceDate: date,
  origin: enumeration(Object.keys(ORIGINS)),
  questionnaire,
  feedback: enumeration(Object.keys(FEEDBACK)),
};
const surveyRequired = [
  'id',
  'createdAt',
  'sectorIds',
  'answers',
  'nps',
  'comment',
  'shift',
  'doctor',
];
const contactFields = {
  name: text(2, 80),
  phone: text(8, 20),
  email: str,
  message: text(10, 1200),
  settingsVersion: version,
};
const scheduleFields = {
  sectorId: sector,
  date,
  shift: enumeration(['manha', 'tarde', 'noite']),
  team: text(2, 80),
};
const schemas = {
  Error: obj({ code: str, error: str }),
  User: obj({ id, ...userFields, mustChangePassword: bool }),
  Session: obj({ user: nullable(ref('User')), csrfToken: nullable(str) }),
  Question: obj({ id: str, sectorId: questionnaire, text: text(8, 160), version }),
  Answer: obj({
    questionId: str,
    questionText: text(1, 160),
    questionVersion: version,
    sectorId: questionnaire,
    value: integer(1, 5),
  }),
  Submission: {
    ...obj({ ...surveyFields, contactRequest: ref('ContactInput') }, surveyRequired),
    example: {
      id: '0692399d-4013-46c4-8ee8-6c52c2a70001',
      createdAt: '2026-10-20T12:00:00Z',
      sectorIds: ['triagem'],
      answers: [],
      nps: 9,
      comment: '',
      shift: 'nao-informado',
      doctor: '',
      origin: 'link',
      questionnaire: 'triagem',
      feedback: 'elogio',
    },
  },
  Response: obj(
    {
      ...surveyFields,
      id: str,
      nps: nullable(integer(0, 10)),
      teams: list(obj({ sectorId: sector, name: str, scheduleVersion: version })),
    },
    surveyRequired,
  ),
  ContactInput: obj({ ...contactFields, consent: { type: 'boolean', const: true } }, [
    'name',
    'phone',
    'message',
    'settingsVersion',
    'consent',
  ]),
  Contact: obj({
    id,
    surveyId: id,
    createdAt: timestamp,
    sectorIds: list(sector),
    ...contactFields,
    consentText: str,
    status,
  }),
  Settings: {
    ...obj({
      version,
      contactPrompt: text(8, 400),
      contactConsent: text(8, 400),
      confirmationText: text(8, 400),
      successText: text(8, 400),
      ombudsmanEmail: credentials.email,
    }),
    example: { ...DEFAULT_SETTINGS, ombudsmanEmail: 'ouvidoria@example.test' },
  },
  Schedule: obj({ ...scheduleFields, version }),
  Wall: obj({
    updatedAt: timestamp,
    period: obj({ from: timestamp, to: timestamp }),
    minimumResponses: integer(5, 5),
    total: nullable(integer(0)),
    nps: nullable(integer(-100, 100)),
    satisfaction: nullable(integer(0, 100)),
    sectors: list(
      obj({
        id: sector,
        name: str,
        responses: nullable(integer(0)),
        average: nullable({ type: 'number', minimum: 1, maximum: 5 }),
      }),
    ),
  }),
  AuditEvent: obj({
    createdAt: timestamp,
    event: enumeration([
      'user_created',
      'password_changed',
      'question_changed',
      'schedule_changed',
      'contact_updated',
    ]),
  }),
};
const paths = {};
const json = (schema) => ({ 'application/json': { schema } });
const errors = {
  400: 'Dados ou parâmetros inválidos.',
  401: 'Credenciais inválidas ou sessão ausente ou expirada.',
  403: 'Origem, CSRF, perfil, setor ou troca obrigatória de senha.',
  404: 'Registro não encontrado.',
  409: 'Conflito de versão, duplicidade ou ID reutilizado com outros dados.',
  413: 'Corpo acima de 32 KiB.',
  415: 'Content-Type precisa ser application/json.',
  429: 'Limite de tentativas atingido. Consulte Retry-After.',
  500: 'Falha interna.',
};
function route(
  method,
  path,
  summary,
  {
    access = 'Público',
    response,
    body,
    code = 200,
    fail = [],
    parameters = [],
    csrf = false,
    description = '',
    extra = {},
  } = {},
) {
  const secure = access !== 'Público';
  const mutation = method !== 'get';
  const statuses = new Set([
    ...fail,
    500,
    ...(secure ? [401, 403] : []),
    ...(mutation ? [403] : []),
    ...(body ? [400, 413, 415] : []),
  ]);
  const responses = Object.fromEntries(
    [...statuses].map((n) => [n, { description: errors[n], content: json(ref('Error')) }]),
  );
  responses[code] = {
    description: 'Operação concluída.',
    ...(response ? { content: json(response) } : {}),
  };
  Object.assign(responses, extra);
  (paths[path] ??= {})[method] = {
    summary,
    description:
      'Acesso: ' +
      access +
      '. ' +
      description +
      (mutation ? ' O navegador deve enviar Origin correspondente a APP_ORIGIN.' : ''),
    security: secure ? [csrf ? { session: [], csrf: [] } : { session: [] }] : [],
    parameters,
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses,
  };
}
const admin = 'Super Admin',
  analytics = 'Super Admin, Gestão e Admin de Setor (somente seu setor)',
  edit = 'Super Admin e Admin de Setor (somente seu setor)',
  contacts = 'Super Admin e Ouvidoria',
  session = 'Usuário autenticado, inclusive com senha temporária';
const questions = obj({ questions: list(ref('Question')) }),
  settings = obj({ settings: ref('Settings') });
route('get', '/api/health', 'Consultar disponibilidade', { response: obj({ ok: bool }) });
route('get', '/api/openapi.json', 'Ler o contrato OpenAPI', {
  response: { type: 'object', description: 'Documento OpenAPI 3.1 com info, paths e components.' },
});
route('get', '/api/docs', 'Abrir a documentação interativa', {
  code: 302,
  extra: {
    302: {
      description: 'Redireciona para a interface Swagger UI.',
      headers: { Location: { schema: str } },
    },
  },
});
route('get', '/api/auth/session', 'Consultar sessão', {
  response: ref('Session'),
  description: 'Visitantes recebem user e csrfToken nulos.',
});
route('post', '/api/auth/login', 'Entrar', {
  body: obj({ email: credentials.email, password: { ...text(0, 128), format: 'password' } }),
  response: ref('Session'),
  fail: [401, 429],
  description: 'Define o cookie de sessão HttpOnly. O CSRF vem no envelope da sessão.',
});
route('post', '/api/auth/logout', 'Sair', { access: session, csrf: true, code: 204 });
route('post', '/api/auth/password', 'Trocar senha e renovar sessão', {
  access: session,
  csrf: true,
  body: obj({
    currentPassword: { ...text(1, 128), format: 'password' },
    newPassword: credentials.password,
  }),
  response: ref('Session'),
  fail: [429],
  description: 'A nova senha deve ser diferente da atual. Revoga sessões anteriores.',
});
route('get', '/api/questions', 'Consultar perguntas publicadas', { response: questions });
route('post', '/api/questions', 'Publicar pergunta', {
  access: edit,
  csrf: true,
  body: obj({ text: text(8, 160), sectorId: questionnaire }),
  response: obj({ question: ref('Question') }),
  code: 201,
  fail: [409],
  description: 'Limite de 60 perguntas. Só Super Admin publica perguntas gerais.',
});
route('put', '/api/questions', 'Atualizar perguntas com controle de versão', {
  access: edit,
  csrf: true,
  body: obj({
    questions: { ...list(ref('Question')), minItems: 1, maxItems: 60 },
    expectedVersions: { type: 'object', additionalProperties: version },
  }),
  response: questions,
  fail: [409],
  description:
    'Envie o conjunto publicado com as versões esperadas por ID. O servidor verifica o escopo de cada edição.',
});
route('get', '/api/settings', 'Consultar mensagens da pesquisa', { response: settings });
route('put', '/api/settings', 'Atualizar mensagens e consentimento', {
  access: admin,
  csrf: true,
  body: obj({ expectedVersion: version, settings: ref('Settings') }),
  response: settings,
  fail: [409],
});
route('post', '/api/responses', 'Registrar pesquisa anônima', {
  code: 201,
  body: ref('Submission'),
  response: obj({ id, createdAt: timestamp }),
  fail: [409, 429],
  extra: {
    200: {
      description: 'Reenvio idêntico reconhecido pelo ID.',
      content: json(obj({ id, createdAt: timestamp })),
    },
  },
  description:
    'Data de envio definida pelo servidor. Perguntas precisam corresponder à versão publicada. Data de atendimento não pode ser futura em São Paulo. Só notas de 1 ou 2 habilitam contato opcional com consentimento, telefone e relato. A equipe é atribuída pela escala.',
});
route('get', '/api/responses', 'Consultar respostas no escopo da sessão', {
  access: analytics,
  response: obj({ responses: list(ref('Response')) }),
  description:
    'Comentários livres apenas para Super Admin. Dados de contato são separados. A projeção setorial limita setores, perguntas e equipes.',
});
route('get', '/api/wall', 'Consultar indicadores públicos de 30 dias', {
  response: obj({ summary: ref('Wall') }),
  description: 'Cada indicador exige cinco pesquisas elegíveis. Bases menores retornam null.',
});
route('get', '/api/schedules', 'Consultar escalas mensais', {
  access: analytics,
  parameters: [
    {
      in: 'query',
      name: 'month',
      required: true,
      schema: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' },
      example: '2026-10',
    },
  ],
  response: obj({ schedules: list(ref('Schedule')) }),
  fail: [400],
});
route('put', '/api/schedules', 'Cadastrar ou revisar escala', {
  access: edit,
  csrf: true,
  body: obj({ ...scheduleFields, expectedVersion: integer(0, 999999) }),
  response: obj({ schedule: ref('Schedule') }),
  fail: [409],
  description:
    'Use versão esperada zero para cadastro. Respostas anteriores preservam a atribuição original.',
});
route('get', '/api/admin/contacts', 'Consultar contatos autorizados', {
  access: contacts,
  response: obj({ contacts: list(ref('Contact')) }),
});
route('patch', '/api/admin/contacts/{id}', 'Alterar situação do contato', {
  access: contacts,
  csrf: true,
  parameters: [{ in: 'path', name: 'id', required: true, schema: id }],
  body: obj({ status }),
  response: obj({ contact: ref('Contact') }),
  fail: [404],
});
route('get', '/api/admin/users', 'Consultar usuários', {
  access: admin,
  response: obj({ users: list(ref('User')) }),
});
route('post', '/api/admin/users', 'Criar acesso com senha temporária', {
  access: admin,
  csrf: true,
  body: obj({ ...userFields, password: credentials.password }),
  response: obj({ user: ref('User') }),
  code: 201,
  fail: [409, 429],
  description: 'Admin de Setor exige setor válido. Os outros perfis usam sectorId nulo.',
});
route('get', '/api/admin/audit', 'Consultar os 100 eventos mais recentes', {
  access: admin,
  response: obj({ events: list(ref('AuditEvent')) }),
});
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'FHDOD · API de experiência do paciente',
    version: '0.4.0',
    description:
      'Protótipo acadêmico. Use dados fictícios. A sessão do navegador determina as permissões das operações.',
  },
  servers: [{ url: '/' }],
  paths,
  components: {
    schemas,
    securitySchemes: {
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'medicare_session',
        description: 'Cookie HttpOnly definido no login da aplicação.',
      },
      csrf: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Token da sessão atual para escritas autenticadas.',
      },
    },
  },
};
