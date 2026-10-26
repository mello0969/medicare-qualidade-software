import { SECTORS, calculateMetrics, type SurveyResponse } from './domain.ts';

export const WALL_MINIMUM_RESPONSES = 5;
export type WallSummary = {
  updatedAt: string;
  period: { from: string; to: string };
  minimumResponses: number;
  total: number | null;
  nps: number | null;
  satisfaction: number | null;
  sectors: { id: string; name: string; responses: number | null; average: number | null }[];
};

/** Public projection: no identifiers, free text, contacts, shifts or individual teams. */
export function buildWallSummary(responses: SurveyResponse[], now = new Date()): WallSummary {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recent = responses.filter((r) => {
    const time = Date.parse(r.createdAt);
    return time >= cutoff.getTime() && time <= now.getTime();
  });
  const metrics = calculateMetrics(recent);
  const ratedResponses = recent.filter((r) => r.answers.length > 0).length;
  return {
    updatedAt: now.toISOString(),
    period: { from: cutoff.toISOString(), to: now.toISOString() },
    minimumResponses: WALL_MINIMUM_RESPONSES,
    total: recent.length >= WALL_MINIMUM_RESPONSES ? recent.length : null,
    nps: metrics.npsResponses >= WALL_MINIMUM_RESPONSES ? metrics.nps : null,
    satisfaction: ratedResponses >= WALL_MINIMUM_RESPONSES ? metrics.satisfaction : null,
    sectors: SECTORS.map((sector) => {
      const rows = recent.filter((r) => r.answers.some((a) => a.sectorId === sector.id));
      const values = rows.flatMap((r) =>
        r.answers.filter((a) => a.sectorId === sector.id).map((a) => a.value),
      );
      const visible = rows.length >= WALL_MINIMUM_RESPONSES;
      return {
        id: sector.id,
        name: sector.name,
        responses: visible ? rows.length : null,
        average: visible
          ? Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10
          : null,
      };
    }),
  };
}
