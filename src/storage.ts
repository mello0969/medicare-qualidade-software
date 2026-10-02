import { DEFAULT_QUESTIONS, isSector, type Question, type SurveyResponse } from './domain';

const RESPONSE_KEY = 'medicare.responses.v1';
const QUESTION_KEY = 'medicare.questions.v1';
const message =
  'Não foi possível acessar os dados deste navegador. Verifique se o armazenamento está permitido. Seus dados existentes não foram substituídos.';
const validRating = (n: unknown, max: number) =>
  Number.isInteger(n) && Number(n) >= 0 && Number(n) <= max;
export function validResponse(r: any): r is SurveyResponse {
  return (
    r &&
    typeof r.id === 'string' &&
    typeof r.createdAt === 'string' &&
    Number.isFinite(Date.parse(r.createdAt)) &&
    Array.isArray(r.sectorIds) &&
    r.sectorIds.length > 0 &&
    r.sectorIds.every(isSector) &&
    Array.isArray(r.answers) &&
    r.answers.every(
      (a: any) =>
        a &&
        typeof a.questionId === 'string' &&
        typeof a.questionText === 'string' &&
        Number.isInteger(a.questionVersion) &&
        a.questionVersion >= 1 &&
        isSector(a.sectorId) &&
        r.sectorIds.includes(a.sectorId) &&
        validRating(a.value, 5) &&
        a.value >= 1,
    ) &&
    (r.nps === null || validRating(r.nps, 10)) &&
    typeof r.comment === 'string' &&
    r.comment.length <= 600 &&
    ['par', 'impar', 'nao-informado'].includes(r.shift) &&
    typeof r.doctor === 'string'
  );
}
export function validQuestions(qs: any): qs is Question[] {
  return (
    Array.isArray(qs) &&
    qs.length === DEFAULT_QUESTIONS.length &&
    new Set(qs.map((q) => q?.id)).size === qs.length &&
    qs.every(
      (q) =>
        q &&
        DEFAULT_QUESTIONS.some((d) => d.id === q.id && d.sectorId === q.sectorId) &&
        typeof q.text === 'string' &&
        q.text.trim().length >= 8 &&
        q.text.length <= 160 &&
        Number.isInteger(q.version) &&
        q.version >= 1,
    )
  );
}
function read<T>(key: string, fallback: T, valid: (data: any) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (!valid(data)) throw new Error();
    return data;
  } catch {
    throw new Error(message);
  }
}
export const loadResponses = () =>
  read<SurveyResponse[]>(
    RESPONSE_KEY,
    [],
    (data) => Array.isArray(data) && data.every(validResponse),
  );
export const loadQuestions = () =>
  read<Question[]>(
    QUESTION_KEY,
    DEFAULT_QUESTIONS.map((q) => ({ ...q })),
    validQuestions,
  );
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event('medicare-storage'));
  } catch {
    throw new Error(
      'Não foi possível salvar. O navegador pode estar sem espaço ou bloqueando o armazenamento. Tente novamente sem fechar esta página.',
    );
  }
}
export function saveResponse(response: SurveyResponse) {
  if (!validResponse(response)) throw new Error('Revise as respostas antes de enviar.');
  const previous = loadResponses();
  if (!previous.some((r) => r.id === response.id)) write(RESPONSE_KEY, [response, ...previous]);
}
export function saveQuestions(questions: Question[]) {
  if (!validQuestions(questions))
    throw new Error('As perguntas devem ter entre 8 e 160 caracteres.');
  loadQuestions(); // Never replace unreadable data silently.
  write(QUESTION_KEY, questions);
}
