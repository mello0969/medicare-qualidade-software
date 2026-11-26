import { useState } from 'react';
import { ArrowsClockwise, Eraser, MagnifyingGlass } from '@phosphor-icons/react';
import { SECTORS, ORIGINS, SHIFT_LABELS, type Filters, type SurveyResponse } from './domain';
import { recentFilters } from './analytics';

type Props = {
  value: Filters;
  source: SurveyResponse[];
  sectors: (typeof SECTORS)[number][];
  busy: boolean;
  onApply: (next: Filters, compare: boolean) => void;
  onRefresh: () => void;
};
export default function DashboardFilters({
  value,
  source,
  sectors,
  busy,
  onApply,
  onRefresh,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [preset, setPreset] = useState('30');
  const [compare, setCompare] = useState(false);
  const invalid = !!draft.from && !!draft.to && draft.from > draft.to;
  const field = (key: keyof Filters, v: string) =>
    setDraft((prev) => ({ ...prev, [key]: v, ...(key === 'sectorId' ? { team: '' } : {}) }));
  const teams = [
    ...new Set(
      source.flatMap(
        (r) =>
          r.teams
            ?.filter((t) => !draft.sectorId || t.sectorId === draft.sectorId)
            .map((t) => t.name) ?? [],
      ),
    ),
  ].sort();
  const doctors = [...new Set(source.map((r) => r.doctor).filter(Boolean))].sort();
  const options = (key: keyof Filters, title: string, all: string, choices: [string, string][]) => (
    <label>
      {title}
      <select value={draft[key] ?? ''} onChange={(e) => field(key, e.target.value)}>
        <option value="">{all}</option>
        {choices.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  function reset() {
    const initial = recentFilters();
    setPreset('30');
    setDraft(initial);
    setCompare(false);
    onApply(initial, false);
  }
  return (
    <form
      className="dash-filters surface"
      aria-label="Filtros do painel"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onApply(draft, compare);
      }}
    >
      <div className="filter-grid">
        <label>
          Período
          <select
            value={preset}
            onChange={(e) => {
              const p = e.target.value;
              setPreset(p);
              if (p !== 'manual') {
                const { from, to } = recentFilters(Number(p));
                setDraft((f) => ({ ...f, from, to }));
              }
            }}
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="manual">Personalizado</option>
          </select>
        </label>
        {(['from', 'to'] as const).map((key, i) => (
          <label key={key}>
            {i ? 'Até' : 'De'}
            <input
              type="date"
              required
              min="1900-01-01"
              max="9999-12-31"
              value={draft[key]}
              onChange={(e) => {
                setPreset('manual');
                field(key, e.target.value);
              }}
            />
          </label>
        ))}
        {options(
          'sectorId',
          'Setor',
          'Todos do seu escopo',
          sectors.map((s) => [s.id, s.name]),
        )}
        {options('questionnaire', 'Pesquisa', 'Todas', [
          ['geral', 'Pesquisa completa'],
          ...sectors.map((s) => [s.id, 'Pesquisa de ' + s.name] as [string, string]),
          ['desconhecida', 'Sem registro no escopo'],
        ])}
        {options('shift', 'Turno', 'Todos', Object.entries(SHIFT_LABELS))}
        {options(
          'team',
          'Equipe',
          'Todas',
          teams.map((t) => [t, t]),
        )}
        {options('origin', 'Origem', 'Todas', [
          ...Object.entries(ORIGINS),
          ['desconhecida', 'Sem registro'],
        ])}
      </div>
      {doctors.length > 0 && (
        <details className="more-filters">
          <summary>Filtro por profissional{draft.doctor ? ' · ' + draft.doctor : ''}</summary>
          {options(
            'doctor',
            'Profissional',
            'Todos os profissionais',
            doctors.map((d) => [d, d]),
          )}
        </details>
      )}
      {invalid && (
        <p className="error-message" role="alert">
          A data inicial deve ser anterior ou igual à data final.
        </p>
      )}
      <div className="filter-actions">
        <label className="compare">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Comparar com o período anterior
        </label>
        <button type="button" className="text-button" onClick={onRefresh} disabled={busy}>
          <ArrowsClockwise />
          Atualizar agora
        </button>
        <button type="button" className="button secondary" onClick={reset}>
          <Eraser />
          Limpar filtros
        </button>
        <button className="button primary" disabled={invalid}>
          <MagnifyingGlass />
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
