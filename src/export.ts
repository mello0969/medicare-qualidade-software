import { calculateMetrics, sectorName, type Filters, type SurveyResponse } from './domain';

export async function createWorkbook(responses: SurveyResponse[], mode: string, filters: Filters) {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  book.creator = 'FHDOD — projeto acadêmico';
  const info = book.addWorksheet('Resumo');
  const metrics = calculateMetrics(responses);
  info.addRows([
    ['FHDOD — pesquisa de satisfação (projeto acadêmico)'],
    ['Origem dos dados', mode],
    ['Exportado em', new Date().toLocaleString('pt-BR')],
    ['Setor', filters.sectorId ? sectorName(filters.sectorId) : 'Todos'],
    ['Plantão', filters.shift || 'Todos'],
    ['Profissional', filters.doctor || 'Todos'],
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
  const sheet = book.addWorksheet('Respostas');
  sheet.addRow(['ID', 'Data ISO', 'Setores', 'NPS', 'Plantão', 'Profissional', 'Comentário']);
  responses.forEach((r) =>
    sheet.addRow([
      r.id,
      r.createdAt,
      r.sectorIds.map(sectorName).join(', '),
      r.nps,
      r.shift,
      r.doctor || 'Não informado',
      r.comment,
    ]),
  );
  const answers = book.addWorksheet('Avaliações');
  answers.addRow(['ID da resposta', 'Setor', 'Pergunta', 'Versão', 'Nota (1–5)']);
  responses.forEach((r) =>
    r.answers.forEach((a) =>
      answers.addRow([r.id, sectorName(a.sectorId), a.questionText, a.questionVersion, a.value]),
    ),
  );
  for (const ws of book.worksheets) {
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153E38' } };
    ws.columns.forEach((col, i) => {
      col.width = i === 0 ? 38 : 28;
    });
    if (ws !== info)
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
  info.getColumn(2).width = 80;
  answers.getColumn(3).width = 70;
  sheet.getColumn(7).width = 70;
  return book;
}

export async function exportExcel(responses: SurveyResponse[], mode: string, filters: Filters) {
  const book = await createWorkbook(responses, mode, filters);
  const data = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `medicare-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
