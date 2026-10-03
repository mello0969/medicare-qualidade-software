import { DEFAULT_QUESTIONS, type Question, type SurveyResponse } from './domain';
import { validResponse, validQuestions } from './validation';
export { validResponse, validQuestions } from './validation';

const RESPONSE_KEY = 'medicare.responses.v1';
const QUESTION_KEY = 'medicare.questions.v1';
const message =
  'Não foi possível acessar os dados deste navegador. Verifique se o armazenamento está permitido. Seus dados existentes não foram substituídos.';
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
