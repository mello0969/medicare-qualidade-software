import type {
  Question,
  QuestionSectorId,
  SectorId,
  SurveyResponse,
  SurveySubmission,
  SurveySettings,
  ContactRequest,
  ContactStatus,
} from './domain';

export type UserRole = 'manager' | 'sector-admin';
export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  sectorId: SectorId | null;
  mustChangePassword: boolean;
};
export type Session = { user: User | null; csrfToken: string | null };
export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  sectorId: SectorId | null;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function errorMessage(payload: unknown, status: number) {
  if (status >= 500) return 'O servidor não conseguiu concluir a solicitação. Tente novamente.';
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
    if (body.error && typeof body.error === 'object') {
      const error = body.error as Record<string, unknown>;
      if (typeof error.message === 'string') return error.message;
    }
  }
  if (status === 401) return 'Entre com sua conta para continuar.';
  if (status === 403) return 'Sua conta não tem permissão para esta ação.';
  if (status === 409)
    return 'Os dados foram atualizados por outra pessoa. Recarregue e confira antes de salvar.';
  if (status === 429)
    return 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.';
  return 'Não foi possível concluir a solicitação. Confira os dados e tente novamente.';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json', ...init.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      'Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.',
      0,
    );
  }
  if (response.status === 204 && response.ok) return undefined as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.ok
        ? 'O servidor enviou uma resposta inválida. Tente novamente.'
        : errorMessage(null, response.status),
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok) throw new ApiError(errorMessage(payload, response.status), response.status);
  return payload as T;
}

function json(method: string, body: unknown, csrfToken?: string): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    body: JSON.stringify(body),
  };
}

function protectedToken(token: string) {
  if (!token)
    throw new ApiError('Sua sessão precisa ser atualizada. Entre novamente para continuar.', 403);
  return token;
}

export function getSession() {
  return request<Session>('/auth/session');
}

export function login(email: string, password: string) {
  return request<Session>('/auth/login', json('POST', { email, password }));
}

export function logout(csrfToken: string) {
  return request<void>('/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': protectedToken(csrfToken) },
  });
}

export async function getQuestions() {
  return (await request<{ questions: Question[] }>('/questions')).questions;
}

export async function getResponses() {
  return (await request<{ responses: SurveyResponse[] }>('/responses')).responses;
}

export function submitResponse(response: SurveySubmission) {
  return request<{ id: string; createdAt: string }>('/responses', json('POST', response));
}

export async function updateQuestions(
  questions: Question[],
  expectedVersions: Record<string, number>,
  csrfToken: string,
) {
  return (
    await request<{ questions: Question[] }>(
      '/questions',
      json('PUT', { questions, expectedVersions }, protectedToken(csrfToken)),
    )
  ).questions;
}

export async function getUsers() {
  return (await request<{ users: User[] }>('/admin/users')).users;
}

export async function createUser(input: CreateUserInput, csrfToken: string) {
  return (
    await request<{ user: User }>('/admin/users', json('POST', input, protectedToken(csrfToken)))
  ).user;
}

export function changePassword(currentPassword: string, newPassword: string, csrfToken: string) {
  return request<Session>(
    '/auth/password',
    json('POST', { currentPassword, newPassword }, protectedToken(csrfToken)),
  );
}
export async function createQuestion(text: string, sectorId: QuestionSectorId, csrfToken: string) {
  return (
    await request<{ question: Question }>(
      '/questions',
      json('POST', { text, sectorId }, protectedToken(csrfToken)),
    )
  ).question;
}
export async function getSettings() {
  return (await request<{ settings: SurveySettings }>('/settings')).settings;
}
export async function updateSettings(
  settings: SurveySettings,
  expectedVersion: number,
  csrfToken: string,
) {
  return (
    await request<{ settings: SurveySettings }>(
      '/settings',
      json('PUT', { settings, expectedVersion }, protectedToken(csrfToken)),
    )
  ).settings;
}
export async function getContacts() {
  return (await request<{ contacts: ContactRequest[] }>('/admin/contacts')).contacts;
}
export async function updateContactStatus(id: string, status: ContactStatus, csrfToken: string) {
  return request<{ contact: ContactRequest }>(
    `/admin/contacts/${encodeURIComponent(id)}`,
    json('PATCH', { status }, protectedToken(csrfToken)),
  );
}
