import { isSector, type Question, type SurveyResponse } from './domain.ts';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const text = (value: unknown, max: number, min = 0): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

export function validResponse(value: unknown): value is SurveyResponse {
  if (!object(value)) return false;
  const { id, createdAt, sectorIds, answers, nps, comment, shift, doctor } = value;
  if (
    !text(id, 80, 1) ||
    !text(createdAt, 40, 1) ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !Array.isArray(sectorIds) ||
    !sectorIds.length ||
    sectorIds.length > 6 ||
    !sectorIds.every(isSector) ||
    new Set(sectorIds).size !== sectorIds.length ||
    !Array.isArray(answers) ||
    answers.length > 60 ||
    !(nps === null || integer(nps, 0, 10)) ||
    !text(comment, 600) ||
    !text(doctor, 40) ||
    typeof shift !== 'string' ||
    !['par', 'impar', 'nao-informado'].includes(shift)
  )
    return false;
  return (
    answers.every(
      (answer) =>
        object(answer) &&
        text(answer.questionId, 80, 1) &&
        text(answer.questionText, 160, 1) &&
        integer(answer.questionVersion, 1, 1_000_000) &&
        (answer.sectorId === 'geral' ||
          (isSector(answer.sectorId) && sectorIds.includes(answer.sectorId))) &&
        integer(answer.value, 1, 5),
    ) && new Set(answers.map((answer) => answer.questionId)).size === answers.length
  );
}

export function validQuestions(value: unknown): value is Question[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 60 &&
    new Set(value.map((q) => (object(q) ? q.id : null))).size === value.length &&
    value.every(
      (q) =>
        object(q) &&
        text(q.id, 80, 1) &&
        (q.sectorId === 'geral' || isSector(q.sectorId)) &&
        text(q.text, 160) &&
        q.text.trim().length >= 8 &&
        integer(q.version, 1, 1_000_000),
    )
  );
}
