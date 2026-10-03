import { describe, expect, it } from 'vitest';
import {
  calculateMetrics,
  createDemoResponses,
  EMPTY_FILTERS,
  filterResponses,
  sectorSummary,
  type SurveyResponse,
} from './domain';
import { validQuestions, validResponse } from './storage';
import { DEFAULT_QUESTIONS } from './domain';
import { createWorkbook } from './export';

const response = (nps: number | null, value = 5): SurveyResponse => ({
  id: crypto.randomUUID(),
  createdAt: new Date(2026, 9, 2, 15).toISOString(),
  sectorIds: ['recepcao'],
  answers: [
    {
      questionId: 'q1',
      questionText: 'Como foi?',
      questionVersion: 1,
      sectorId: 'recepcao',
      value,
    },
  ],
  nps,
  comment: '',
  shift: 'par',
  doctor: 'A',
});
describe('Indicadores', () => {
  it('aplica os limites do NPS e exclui respostas puladas do denominador', () => {
    const metrics = calculateMetrics([0, 6, 7, 8, 9, 10, null].map((n) => response(n)));
    expect(metrics).toMatchObject({
      total: 7,
      promoters: 2,
      detractors: 2,
      passives: 2,
      npsResponses: 6,
      nps: 0,
    });
    expect(calculateMetrics([response(10), response(9), response(6)]).nps).toBe(33);
  });
  it('não confunde ausência de evidência com nota zero', () => {
    expect(calculateMetrics([])).toMatchObject({ total: 0, nps: null, satisfaction: null });
    expect(calculateMetrics([{ ...response(null), answers: [] }]).nps).toBeNull();
    expect(calculateMetrics([response(0)]).nps).toBe(-100);
  });
  it('calcula satisfação com notas 4 e 5, preservando todas as avaliações no denominador', () => {
    expect(calculateMetrics([1, 2, 3, 4, 5].map((n) => response(null, n))).satisfaction).toBe(40);
  });
  it('filtra as avaliações do setor sem contar a mesma recomendação duas vezes', () => {
    const multi = { ...response(10), sectorIds: ['recepcao', 'triagem'] as const };
    const record: SurveyResponse = {
      ...multi,
      sectorIds: [...multi.sectorIds],
      answers: [
        ...multi.answers,
        { ...multi.answers[0], questionId: 'q2', sectorId: 'triagem', value: 1 },
      ],
    };
    const filtered = filterResponses([record], { ...EMPTY_FILTERS, sectorId: 'triagem' });
    expect(calculateMetrics(filtered)).toMatchObject({
      total: 1,
      satisfaction: 0,
      npsResponses: 1,
    });
    expect(sectorSummary(filtered).find((s) => s.id === 'triagem')?.average).toBe(1);
    expect(record.answers).toHaveLength(2);
  });
  it('inclui todo o dia final e combina filtros de plantão e profissional', () => {
    const record = response(9);
    record.createdAt = new Date(2026, 9, 2, 23, 59).toISOString();
    expect(
      filterResponses([record], {
        ...EMPTY_FILTERS,
        from: '2026-10-02',
        to: '2026-10-02',
        shift: 'par',
        doctor: 'A',
      }),
    ).toHaveLength(1);
    expect(filterResponses([record], { ...EMPTY_FILTERS, shift: 'impar' })).toHaveLength(0);
    expect(filterResponses([record], { ...EMPTY_FILTERS, from: '2026-10-03' })).toHaveLength(0);
  });
});
describe('Integridade dos dados', () => {
  it('gera somente registros sintéticos válidos e distintos', () => {
    const data = createDemoResponses(new Date('2026-10-02T12:00:00Z'));
    expect(data.every(validResponse)).toBe(true);
    expect(new Set(data.map((r) => r.id)).size).toBe(data.length);
  });
  it('rejeita registros incompatíveis sem aceitá-los silenciosamente', () => {
    expect(validResponse({ ...response(9), nps: 11 })).toBe(false);
    expect(validResponse({ ...response(9), createdAt: 'invalid' })).toBe(false);
    expect(validResponse({ ...response(9), shift: ['par'] })).toBe(false);
    expect(validResponse({ ...response(9), answers: [{ value: 5 }] })).toBe(false);
    expect(validQuestions(DEFAULT_QUESTIONS)).toBe(true);
    expect(validQuestions(DEFAULT_QUESTIONS.map((q) => ({ ...q, text: '' })))).toBe(false);
  });
});
describe('Exportação Excel', () => {
  it('produz XLSX legível com números, filtros e texto que não vira fórmula', async () => {
    const record = { ...response(9), comment: '=HYPERLINK("https://example.org")' };
    const book = await createWorkbook([record], 'Exemplo', {
      ...EMPTY_FILTERS,
      sectorId: 'recepcao',
    });
    const buffer = await book.xlsx.writeBuffer();
    const { Workbook } = await import('exceljs');
    const loaded = new Workbook();
    await loaded.xlsx.load(buffer);
    expect(loaded.worksheets).toHaveLength(3);
    expect(loaded.getWorksheet('Respostas')?.getCell('D2').value).toBe(9);
    expect(loaded.getWorksheet('Respostas')?.getCell('G2').value).toBe(record.comment);
    expect(loaded.getWorksheet('Resumo')?.getCell('B4').value).toBe('Recepção');
    expect(loaded.getWorksheet('Avaliações')?.getCell('D2').value).toBe(1);
  });
});
