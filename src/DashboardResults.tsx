import { useState } from 'react';
import { SHIFT_LABELS, type SurveyResponse, type Filters } from './domain';
import {
  dailyTrend,
  dayIndex,
  displayDate,
  distribution,
  indicators,
  percentage,
  sectorResults,
  showPercent,
} from './analytics';

function cards(rows: SurveyResponse[]) {
  const m = indicators(rows);
  const category = (key: 'promoters' | 'passives' | 'detractors', title: string) => ({
    title,
    value: showPercent(percentage(m[key], m.npsResponses)),
    detail: `${m[key]} de ${m.npsResponses}`,
  });
  return [
    { title: 'NPS', value: m.nps === null ? '—' : String(m.nps), detail: 'n = ' + m.npsResponses },
    category('promoters', 'Promotores (9 e 10)'),
    category('passives', 'Passivos (7 e 8)'),
    category('detractors', 'Detratores (0 a 6)'),
    {
      title: 'Manifestações',
      value: String(m.manifestations),
      detail: `Reclamações: ${m.feedback.reclamacao} · Sugestões: ${m.feedback.sugestao} · Elogios: ${m.feedback.elogio}`,
    },
    {
      title: 'Cobertura de atribuição',
      value: showPercent(percentage(m.covered, m.total)),
      detail: `${m.covered} de ${m.total} respostas com turno e equipe`,
    },
  ];
}
export function IndicatorCards({
  rows,
  previous,
}: {
  rows: SurveyResponse[];
  previous?: SurveyResponse[];
}) {
  const before = previous && cards(previous);
  return (
    <section className="kpi-grid" aria-label="Indicadores de satisfação">
      {cards(rows).map((card, i) => (
        <article key={card.title} className="kpi surface">
          <h2>{card.title}</h2>
          <strong>{card.value}</strong>
          <p>{card.detail}</p>
          {before && (
            <small>
              Anterior: {before[i].value} · {before[i].detail}
            </small>
          )}
        </article>
      ))}
    </section>
  );
}
export function ScoreCharts({ rows, filters }: { rows: SurveyResponse[]; filters: Filters }) {
  const scores = distribution(rows);
  const trend = dailyTrend(rows);
  const start = dayIndex(filters.from),
    span = dayIndex(filters.to) - start;
  const x = (day: string) => (span ? 44 + (516 * (dayIndex(day) - start)) / span : 302);
  const y = (n: number) => 110 - n * 0.85;
  return (
    <div className="charts-grid">
      <section className="surface dash-section">
        <h2>Distribuição das notas de 0 a 10</h2>
        <p>
          Quantidade e percentual de cada nota (n = {scores.reduce((sum, s) => sum + s.count, 0)}).
        </p>
        <ul className="score-list" aria-label="Distribuição por nota">
          {scores.map((s) => (
            <li key={s.score}>
              <b>{s.score}</b>
              <span className="track" aria-hidden="true">
                <i style={{ width: (s.percent ?? 0) + '%' }} />
              </span>
              <span>{s.count}</span>
              <span>{showPercent(s.percent)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="surface dash-section">
        <h2>Tendência</h2>
        <p>NPS por dia de envio, de −100 a 100. Dias sem nota ficam em branco.</p>
        <svg
          viewBox="0 0 580 235"
          className="trend-plot"
          role="img"
          aria-label="Tendência diária do NPS. Os valores estão disponíveis na tabela abaixo."
        >
          {[-100, -50, 0, 50, 100].map((n) => (
            <g key={n}>
              <text x="34" y={y(n) + 4} textAnchor="end">
                {n}
              </text>
              <line x1="42" x2="565" y1={y(n)} y2={y(n)} stroke={n === 0 ? '#81909d' : '#dce2e8'} />
            </g>
          ))}
          {trend.map((d, i) => {
            if (d.nps === null) return null;
            const prev = trend[i - 1];
            return (
              <g key={d.day}>
                {prev && prev.nps !== null && dayIndex(d.day) - dayIndex(prev.day) === 1 && (
                  <line
                    x1={x(prev.day)}
                    y1={y(prev.nps)}
                    x2={x(d.day)}
                    y2={y(d.nps)}
                    stroke="currentColor"
                    strokeWidth="2.5"
                  />
                )}
                <circle cx={x(d.day)} cy={y(d.nps)} r="3.8" fill="currentColor">
                  <title>
                    {displayDate(d.day)} · NPS {d.nps}
                  </title>
                </circle>
              </g>
            );
          })}
          <text x="42" y="222">
            {displayDate(filters.from)}
          </text>
          <text x="565" y="222" textAnchor="end">
            {displayDate(filters.to)}
          </text>
        </svg>
        <details>
          <summary>Ver tabela da tendência</summary>
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>NPS</th>
                <th>Notas válidas</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((d) => (
                <tr key={d.day}>
                  <td>{displayDate(d.day)}</td>
                  <td>{d.nps ?? '—'}</td>
                  <td>{d.npsResponses}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!trend.length && <p>Sem respostas no período.</p>}
        </details>
      </section>
    </div>
  );
}
function detailsFor(rows: SurveyResponse[], sector: string) {
  const questions = new Map<string, { label: string; count: number; sum: number }>();
  const shifts = new Map<string, number>(),
    teams = new Map<string, number>();
  for (const row of rows) {
    for (const a of row.answers.filter((a) => a.sectorId === sector)) {
      const id = a.questionId + ':' + a.questionVersion;
      const q = questions.get(id) ?? {
        label: a.questionText + ' · v' + a.questionVersion,
        count: 0,
        sum: 0,
      };
      q.count++;
      q.sum += a.value;
      questions.set(id, q);
    }
    const shift = SHIFT_LABELS[row.shift];
    shifts.set(shift, (shifts.get(shift) ?? 0) + 1);
    const team = row.teams?.find((t) => t.sectorId === sector)?.name ?? 'Sem atribuição';
    teams.set(team, (teams.get(team) ?? 0) + 1);
  }
  return (
    <div className="sector-detail">
      <h3>Perguntas do setor</h3>
      {questions.size ? (
        <ul>
          {[...questions].map(([id, q]) => (
            <li key={id}>
              {q.label} · média{' '}
              {(q.sum / q.count).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/5 (n ={' '}
              {q.count})
            </li>
          ))}
        </ul>
      ) : (
        <p>Sem avaliações de perguntas.</p>
      )}
      {(
        [
          ['Turnos', shifts],
          ['Equipes', teams],
        ] as const
      ).map(([title, group]) => (
        <div key={title}>
          <h3>{title}</h3>
          {group.size ? (
            <ul>
              {[...group].map(([label, count]) => (
                <li key={label}>
                  {label} · {count}
                </li>
              ))}
            </ul>
          ) : (
            <p>Sem respostas.</p>
          )}
        </div>
      ))}
    </div>
  );
}
export function SectorTable({
  rows,
  allowed,
  team,
}: {
  rows: SurveyResponse[];
  allowed: string[];
  team?: string;
}) {
  const [expanded, setExpanded] = useState('');
  return (
    <section className="surface dash-section sector-scores">
      <h2>Resultados por setor</h2>
      <p>
        Selecione um setor para consultar perguntas, turnos e equipes. Uma resposta pode avaliar
        vários setores.
      </p>
      <table>
        <thead>
          <tr>
            <th>Setor</th>
            <th>NPS</th>
            <th>Respostas</th>
          </tr>
        </thead>
        {sectorResults(rows, allowed, team).map((s) => (
          <tbody key={s.id}>
            <tr>
              <th scope="row">
                <button
                  className="text-button"
                  aria-expanded={expanded === s.id}
                  onClick={() => setExpanded(expanded === s.id ? '' : s.id)}
                >
                  {s.name}
                </button>
              </th>
              <td>
                {s.nps ?? '—'}
                {s.nps !== null && (
                  <span className="sector-track track" aria-hidden="true">
                    <i style={{ width: (s.nps + 100) / 2 + '%' }} />
                  </span>
                )}
              </td>
              <td>{s.total}</td>
            </tr>
            {expanded === s.id && (
              <tr>
                <td colSpan={3}>{detailsFor(s.rows, s.id)}</td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </section>
  );
}
