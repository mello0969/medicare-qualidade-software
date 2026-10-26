import { describe, expect, it } from 'vitest';
import { createDemoResponses } from './domain';
import { buildWallSummary } from './wall';

const now = new Date('2026-10-25T23:59:59Z');

describe('TV Wall público', () => {
  it('oculta grupos menores que cinco pesquisas', () => {
    const result = buildWallSummary(createDemoResponses(now).slice(0, 4), now);
    expect(result.total).toBeNull();
    expect(result.nps).toBeNull();
    expect(result.satisfaction).toBeNull();
    expect(result.sectors.every((sector) => sector.average === null)).toBe(true);
  });

  it('retorna somente indicadores agregados, sem dados pessoais nem texto livre', () => {
    const rows = createDemoResponses(now);
    const result = buildWallSummary(rows, now);
    expect(result.total).toBe(rows.length);
    expect(typeof result.nps).toBe('number');
    expect(JSON.stringify(result)).not.toMatch(/comment|phone|doctor|surveyId|questionText/);
    expect(Object.keys(result).sort()).toEqual(
      ['updatedAt', 'period', 'minimumResponses', 'total', 'nps', 'satisfaction', 'sectors'].sort(),
    );
  });

  it('usa trinta dias de envio e não inclui datas futuras ou fora do período', () => {
    const rows = createDemoResponses(now).slice(0, 5);
    const outdated = { ...rows[0], id: 'antiga', createdAt: '2026-09-01T12:00:00Z' };
    const future = { ...rows[0], id: 'futura', createdAt: '2027-01-01T12:00:00Z' };
    expect(buildWallSummary([...rows, outdated, future], now).total).toBe(5);
  });
});
