export const SECTORS = [
  { id: 'recepcao', name: 'Recepção', description: 'Chegada e acolhimento' },
  { id: 'triagem', name: 'Triagem', description: 'Avaliação inicial' },
  { id: 'enfermagem', name: 'Enfermagem', description: 'Cuidado e orientações' },
  { id: 'medico', name: 'Atendimento médico', description: 'Consulta e escuta' },
  { id: 'fisioterapia', name: 'Fisioterapia', description: 'Atendimento especializado' },
  { id: 'raio-x', name: 'Raio X', description: 'Exames de imagem' },
] as const;
export type SectorId = (typeof SECTORS)[number]['id'];
export type Shift = 'par' | 'impar' | 'nao-informado';
export type Question = { id: string; sectorId: SectorId; text: string; version: number };
export type Answer = {
  questionId: string;
  questionText: string;
  questionVersion: number;
  sectorId: SectorId;
  value: number;
};
export type SurveyResponse = {
  id: string;
  createdAt: string;
  sectorIds: SectorId[];
  answers: Answer[];
  nps: number | null;
  comment: string;
  shift: Shift;
  doctor: string;
};
export type Filters = { sectorId: string; shift: string; doctor: string; from: string; to: string };
export const EMPTY_FILTERS: Filters = { sectorId: '', shift: '', doctor: '', from: '', to: '' };
export const sectorName = (id: string) => SECTORS.find((s) => s.id === id)?.name ?? id;
export const isSector = (id: unknown): id is SectorId => SECTORS.some((s) => s.id === id);

export const DEFAULT_QUESTIONS: Question[] = SECTORS.flatMap((s) => [
  {
    id: `${s.id}-atendimento`,
    sectorId: s.id,
    text: `Como foi o atendimento ${s.id === 'medico' ? 'médico' : `na ${s.name.toLowerCase()}`}?`,
    version: 1,
  },
  {
    id: `${s.id}-ambiente`,
    sectorId: s.id,
    text: 'Como estava a limpeza desse ambiente?',
    version: 1,
  },
]);
DEFAULT_QUESTIONS.find((q) => q.id === 'raio-x-atendimento')!.text =
  'Como foi o atendimento no Raio X?';

export function calculateMetrics(responses: SurveyResponse[]) {
  const scores = responses
    .map((r) => r.nps)
    .filter((n): n is number => n !== null && Number.isInteger(n) && n >= 0 && n <= 10);
  const promoters = scores.filter((n) => n >= 9).length;
  const passives = scores.filter((n) => n === 7 || n === 8).length;
  const detractors = scores.filter((n) => n <= 6).length;
  const ratings = responses
    .flatMap((r) => r.answers)
    .filter((a) => Number.isInteger(a.value) && a.value >= 1 && a.value <= 5);
  return {
    total: responses.length,
    promoters,
    passives,
    detractors,
    npsResponses: scores.length,
    nps: scores.length ? Math.round(((promoters - detractors) / scores.length) * 100) : null,
    satisfaction: ratings.length
      ? Math.round((ratings.filter((a) => a.value >= 4).length / ratings.length) * 100)
      : null,
    ratings: ratings.length,
  };
}

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function filterResponses(responses: SurveyResponse[], filters: Filters) {
  return responses
    .filter((r) => {
      const day = localDate(new Date(r.createdAt));
      return (
        (!filters.sectorId || r.sectorIds.includes(filters.sectorId as SectorId)) &&
        (!filters.shift || r.shift === filters.shift) &&
        (!filters.doctor || r.doctor === filters.doctor) &&
        (!filters.from || day >= filters.from) &&
        (!filters.to || day <= filters.to)
      );
    })
    .map((r) =>
      filters.sectorId
        ? { ...r, answers: r.answers.filter((a) => a.sectorId === filters.sectorId) }
        : r,
    );
}

export function sectorSummary(responses: SurveyResponse[]) {
  return SECTORS.map((s) => {
    const answers = responses.flatMap((r) => r.answers.filter((a) => a.sectorId === s.id));
    return {
      ...s,
      count: answers.length,
      average: answers.length
        ? answers.reduce((sum, a) => sum + a.value, 0) / answers.length
        : null,
    };
  });
}

// Reproducible, synthetic records; never written into collected responses.
export function createDemoResponses(now = new Date()): SurveyResponse[] {
  const comments = [
    'Fui bem orientada desde a recepção. Obrigada pelo acolhimento.',
    'A equipe de enfermagem foi muito atenciosa e explicou cada cuidado.',
    'Gostaria de receber mais informações enquanto aguardo o atendimento.',
    'O ambiente estava limpo e a equipe me ajudou a encontrar o setor.',
    'O médico ouviu minhas dúvidas com calma.',
    'A sinalização até a sala de exames poderia ser mais clara.',
  ];
  return Array.from({ length: 124 }, (_, i): SurveyResponse => {
    const date = new Date(now);
    date.setDate(date.getDate() - (i % 30));
    date.setHours(8 + (i % 12), i % 60, 0, 0);
    const sectorIds: SectorId[] = [SECTORS[i % 6].id];
    if (i % 3 === 0 && !sectorIds.includes('recepcao')) sectorIds.push('recepcao');
    return {
      id: `exemplo-${i}`,
      createdAt: date.toISOString(),
      sectorIds,
      answers: DEFAULT_QUESTIONS.filter((q) => sectorIds.includes(q.sectorId)).map((q, j) => ({
        questionId: q.id,
        questionText: q.text,
        questionVersion: q.version,
        sectorId: q.sectorId,
        value: i % 9 === 0 ? 2 : i % 7 === 0 ? 3 : (i + j) % 3 === 0 ? 4 : 5,
      })),
      nps: i % 11 === 0 ? null : i % 7 === 0 ? 5 : i % 4 === 0 ? 8 : i % 3 === 0 ? 9 : 10,
      comment: i % 5 === 0 ? comments[(i / 5) % comments.length] : '',
      shift: i % 2 === 0 ? 'par' : 'impar',
      doctor: i % 2 === 0 ? 'Profissional A (exemplo)' : 'Profissional B (exemplo)',
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
