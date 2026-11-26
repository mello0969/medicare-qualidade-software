import { describe, expect, it } from 'vitest';
import { createDemoResponses, EMPTY_FILTERS, filterResponses, type SurveyResponse } from './domain';
import {
  dailyTrend,
  distribution,
  indicators,
  previousPeriod,
  recentFilters,
  sectorResults,
} from './analytics';

const sample = createDemoResponses()[0];
const rows: SurveyResponse[] = [10, 10, 10, 10, 8, 5, null].map((nps, i) => ({
  ...sample,
  id: String(i),
  nps,
  createdAt: '2024-03-01T12:00:00Z',
  sectorIds: ['triagem', 'recepcao'],
  teams: [{ name: 'A', sectorId: 'triagem', scheduleVersion: 1 }],
  shift: 'manha',
  feedback: i === 0 ? 'sugestao' : undefined,
  origin: 'qr',
  questionnaire: 'geral',
}));
describe('Indicadores do painel', () => {
  it('usa denominadores próprios para recomendação, manifestações e atribuição', () => {
    expect(indicators(rows)).toMatchObject({
      nps: 50,
      total: 7,
      npsResponses: 6,
      promoters: 4,
      passives: 1,
      detractors: 1,
      covered: 7,
      manifestations: 1,
    });
    expect(distribution(rows)[10]).toMatchObject({ count: 4 });
    expect(dailyTrend(rows)[0]).toMatchObject({ nps: 50, day: '2024-03-01' });
    expect(indicators([]).nps).toBeNull();
    expect(distribution([])).toHaveLength(11);
    expect(dailyTrend([])).toEqual([]);
  });
  it('compara intervalos inclusivos de igual duração atravessando fevereiro bissexto', () => {
    const current = recentFilters(30, new Date(2024, 2, 1));
    expect(current.from).toBe('2024-02-01');
    expect(previousPeriod(current)).toMatchObject({ from: '2024-01-02', to: '2024-01-31' });
  });
  it('combina pesquisa, origem, equipe, plantão, setor e datas sem atribuir a equipe ao setor errado', () => {
    const filters = {
      ...EMPTY_FILTERS,
      questionnaire: 'geral',
      origin: 'qr',
      sectorId: 'triagem',
      team: 'A',
      shift: 'manha',
      from: '2024-03-01',
      to: '2024-03-01',
    };
    expect(filterResponses(rows, filters)).toHaveLength(7);
    for (const [k, v] of Object.entries({
      questionnaire: 'triagem',
      origin: 'link',
      shift: 'noite',
      team: 'B',
      sectorId: 'recepcao',
      doctor: 'Outro',
      to: '2024-02-29',
    }))
      expect(filterResponses(rows, { ...filters, [k]: v })).toHaveLength(0);
    expect(
      indicators(filterResponses(rows, { ...EMPTY_FILTERS, sectorId: 'recepcao' })).covered,
    ).toBe(0);
    expect(sectorResults(rows, ['medico', 'triagem']).map((s) => [s.id, s.nps])).toEqual([
      ['triagem', 50],
      ['medico', null],
    ]);
    const historical = { ...rows[0], origin: undefined, questionnaire: undefined };
    expect(
      filterResponses([historical], {
        ...EMPTY_FILTERS,
        origin: 'desconhecida',
        questionnaire: 'desconhecida',
      }),
    ).toHaveLength(1);
  });
});
