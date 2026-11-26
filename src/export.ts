import {
  FEEDBACK,
  ORIGINS,
  SECTORS,
  sectorName,
  SHIFT_LABELS,
  type Filters,
  type SurveyResponse,
} from './domain';

import {
  indicators,
  distribution,
  dailyTrend,
  sectorResults,
  percentage,
  previousPeriod,
} from './analytics';
export type ExportOptions = {
  kind?: 'respostas' | 'indicadores';
  allowed?: string[];
  previous?: SurveyResponse[];
};
export async function createWorkbook(
  responses: SurveyResponse[],
  mode: string,
  filters: Filters,
  options: ExportOptions = {},
) {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  book.creator = 'FHDOD — projeto acadêmico';
  const info = book.addWorksheet('Resumo');
  const metrics = indicators(responses);
  info.addRows([
    ['FHDOD — pesquisa de satisfação (projeto acadêmico)'],
    ['Origem dos dados', mode],
    ['Exportado em', new Date().toLocaleString('pt-BR')],
    ['Setor', filters.sectorId ? sectorName(filters.sectorId) : 'Todos'],
    ['Plantão', filters.shift || 'Todos'],
    ['Profissional', filters.doctor || 'Todos'],
    ['Equipe da escala', filters.team || 'Todas'],
    ['Data inicial', filters.from || 'Sem limite'],
    ['Data final', filters.to || 'Sem limite'],
    ['Respostas', metrics.total],
    ['NPS', metrics.nps ?? 'Sem respostas'],
    ['Respostas ao NPS', metrics.npsResponses],
    [
      'Satisfação (notas 4 e 5)',
      metrics.satisfaction === null ? 'Sem notas' : `${metrics.satisfaction}%`,
    ],
    ['Método NPS', '100 × (promotores − detratores) / respostas válidas de NPS'],
    ['Limite', 'Protótipo acadêmico; sem integração com os sistemas da FHDOD.'],
  ]);
  info.addRows([
    ['Origem de entrada', filters.origin || 'Todas'],
    ['Pesquisa', filters.questionnaire || 'Todas'],
  ]);
  if (options.kind === 'indicadores') {
    const totals = book.addWorksheet('Indicadores');
    totals.addRow([
      'Período',
      'De',
      'Até',
      'Respostas',
      'NPS',
      'Promotores',
      'Passivos',
      'Detratores',
      'NPS válidos',
      'Reclamações',
      'Sugestões',
      'Elogios',
      'Com turno e equipe',
      'Cobertura (%)',
    ]);
    const addTotals = (name: string, period: Filters, rows: SurveyResponse[]) => {
      const m = indicators(rows);
      totals.addRow([
        name,
        period.from,
        period.to,
        m.total,
        m.nps,
        m.promoters,
        m.passives,
        m.detractors,
        m.npsResponses,
        m.feedback.reclamacao,
        m.feedback.sugestao,
        m.feedback.elogio,
        m.covered,
        percentage(m.covered, m.total),
      ]);
    };
    addTotals('Atual', filters, responses);
    if (options.previous) addTotals('Anterior', previousPeriod(filters), options.previous);
    const scores = book.addWorksheet('Distribuição');
    scores.addRow(['Nota', 'Quantidade', 'Percentual (%)']);
    for (const d of distribution(responses)) scores.addRow([d.score, d.count, d.percent]);
    const trend = book.addWorksheet('Tendência');
    trend.addRow(['Dia', 'NPS', 'Respostas', 'Notas válidas']);
    for (const d of dailyTrend(responses)) trend.addRow([d.day, d.nps, d.total, d.npsResponses]);
    const sectors = book.addWorksheet('Setores');
    sectors.addRow(['Setor', 'NPS', 'Respostas']);
    for (const s of sectorResults(
      responses,
      options.allowed ??
        SECTORS.filter((s) => !filters.sectorId || s.id === filters.sectorId).map((s) => s.id),
      filters.team,
    ))
      sectors.addRow([s.name, s.nps, s.total]);
  } else {
    const sheet = book.addWorksheet('Respostas');
    sheet.addRow([
      'ID',
      'Data de envio ISO',
      'Setores',
      'NPS',
      'Plantão',
      'Código informado',
      'Manifestação',
      'Data do atendimento',
      'Equipes da escala',
      'Pesquisa',
      'Origem',
    ]);
    responses.forEach((r) =>
      sheet.addRow([
        r.id,
        r.createdAt,
        r.sectorIds.map(sectorName).join(', '),
        r.nps,
        SHIFT_LABELS[r.shift],
        r.doctor || 'Não informado',
        r.feedback ? FEEDBACK[r.feedback] : null,
        r.attendanceDate ?? 'Não informada',
        r.teams
          ?.map(
            (team) =>
              `${sectorName(team.sectorId)}: ${team.name} (escala v${team.scheduleVersion})`,
          )
          .join('; ') || 'Não identificadas',
        r.questionnaire
          ? r.questionnaire === 'geral'
            ? 'Completa'
            : sectorName(r.questionnaire)
          : 'Sem registro',
        r.origin ? ORIGINS[r.origin] : 'Sem registro',
      ]),
    );
    const answers = book.addWorksheet('Avaliações');
    answers.addRow(['ID da resposta', 'Setor', 'Pergunta', 'Versão', 'Nota (1–5)']);
    responses.forEach((r) =>
      r.answers.forEach((a) =>
        answers.addRow([r.id, sectorName(a.sectorId), a.questionText, a.questionVersion, a.value]),
      ),
    );
  }
  for (const ws of book.worksheets) {
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF571C26' } };
    ws.columns.forEach((col, i) => {
      col.width = i === 0 ? 38 : 28;
    });
    if (ws !== info)
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
  info.getColumn(2).width = 80;
  const answers = book.getWorksheet('Avaliações');
  if (answers) answers.getColumn(3).width = 70;
  return book;
}

export async function exportExcel(
  responses: SurveyResponse[],
  mode: string,
  filters: Filters,
  options: ExportOptions = {},
) {
  const book = await createWorkbook(responses, mode, filters, options);
  const data = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `fhdod-${options.kind ?? 'respostas'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
