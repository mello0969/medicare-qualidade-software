import {
  calculateMetrics,
  EMPTY_FILTERS,
  localDate,
  SECTORS,
  type SurveyResponse,
  type Filters,
} from './domain';

const dayMs = 86400000;
export const dayIndex = (iso: string) => Date.parse(iso + 'T00:00:00Z') / dayMs;
const isoDay = (index: number) => new Date(index * dayMs).toISOString().slice(0, 10);
export const displayDate = (iso: string) => iso.split('-').reverse().join('/');
export function recentFilters(days = 30, now = new Date()): Filters {
  const to = localDate(now);
  return { ...EMPTY_FILTERS, from: isoDay(dayIndex(to) - days + 1), to };
}
export function previousPeriod(filters: Filters): Filters {
  const start = dayIndex(filters.from);
  const days = dayIndex(filters.to) - start + 1;
  return { ...filters, from: isoDay(start - days), to: isoDay(start - 1) };
}
export const percentage = (count: number, total: number) => (total ? (100 * count) / total : null);
export function showPercent(value: number | null) {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}
export function indicators(rows: SurveyResponse[]) {
  const metrics = calculateMetrics(rows);
  const feedback = { reclamacao: 0, sugestao: 0, elogio: 0 };
  let covered = 0;
  for (const row of rows) {
    if (row.feedback) feedback[row.feedback]++;
    if (row.shift !== 'nao-informado' && row.teams?.length) covered++;
  }
  return {
    ...metrics,
    feedback,
    manifestations: Object.values(feedback).reduce((a, b) => a + b, 0),
    covered,
  };
}
export function distribution(rows: SurveyResponse[]) {
  const counts = Array<number>(11).fill(0);
  for (const { nps } of rows)
    if (nps !== null && Number.isInteger(nps) && nps >= 0 && nps <= 10) counts[nps]++;
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((count, score) => ({ score, count, percent: percentage(count, total) }));
}
export function dailyTrend(rows: SurveyResponse[]) {
  const groups = new Map<string, SurveyResponse[]>();
  for (const row of rows) {
    const day = localDate(new Date(row.createdAt));
    const group = groups.get(day) ?? [];
    group.push(row);
    groups.set(day, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, group]) => ({ day, ...calculateMetrics(group) }));
}
export function sectorResults(rows: SurveyResponse[], allowed: string[], team?: string) {
  return SECTORS.filter((s) => allowed.includes(s.id))
    .map((s) => {
      const group = rows.filter(
        (r) =>
          r.sectorIds.includes(s.id) &&
          (!team || r.teams?.some((t) => t.sectorId === s.id && t.name === team)),
      );
      return { ...s, rows: group, ...calculateMetrics(group) };
    })
    .sort(
      (a, b) =>
        (b.nps ?? -101) - (a.nps ?? -101) ||
        b.total - a.total ||
        a.name.localeCompare(b.name, 'pt-BR'),
    );
}
