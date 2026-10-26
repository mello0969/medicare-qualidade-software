import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from './Auth';
import { ApiError } from './api';
import { localDate, SECTORS, sectorName, type SectorId } from './domain';
import { validAttendanceDate, type ScheduleEntry } from './schedules';
import './schedules.css';

const shiftNames = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' } as const;
const validMonth = (month: string) => validAttendanceDate(`${month}-01`);
const scheduleKey = (entry: Pick<ScheduleEntry, 'sectorId' | 'date' | 'shift'>) =>
  `${entry.sectorId}/${entry.date}/${entry.shift}`;
type Draft = Omit<ScheduleEntry, 'version'> & { expectedVersion: number };

async function scheduleRequest<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/schedules${path}`, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...init.headers },
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Recarregue o mês para conferir.', 0);
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'Confira a data, o setor, o turno e o nome da equipe antes de salvar.',
      401: 'Sua sessão expirou. Entre novamente para continuar.',
      403: 'Seu perfil não tem permissão para esta escala.',
      409: 'Esta escala foi alterada por outra pessoa. Recarregue o mês e use “Editar” na linha atual antes de salvar. Seu texto permanece no formulário.',
      429: 'Muitas solicitações em pouco tempo. Aguarde um momento e tente novamente.',
    };
    throw new ApiError(
      messages[response.status] ?? 'Não foi possível concluir a solicitação. Tente novamente.',
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('O servidor retornou dados inválidos. Recarregue o mês para conferir.', 502);
  }
}

export default function SchedulesPage() {
  const { user, csrfToken, refresh } = useAuth();
  const [month, setMonth] = useState(localDate(new Date()).slice(0, 7));
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [draft, setDraft] = useState<Draft>({
    sectorId: user?.sectorId ?? 'recepcao',
    date: localDate(new Date()),
    shift: 'manha',
    team: '',
    expectedVersion: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const errorNode = useRef<HTMLParagraphElement>(null);
  const teamNode = useRef<HTMLInputElement>(null);
  const canRead = ['manager', 'sector-admin', 'management'].includes(user?.role ?? '');
  const canEdit = user?.role === 'manager' || user?.role === 'sector-admin';
  const sectors =
    user?.role === 'sector-admin' ? SECTORS.filter((item) => item.id === user.sectorId) : SECTORS;

  useEffect(() => {
    setDraft({
      sectorId: user?.sectorId ?? 'recepcao',
      date: `${month}-01`,
      shift: 'manha',
      team: '',
      expectedVersion: 0,
    });
    setConflict(false);
    setNotice('');
  }, [month, user?.id, user?.role, user?.sectorId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setSchedules([]);
    setLoaded(false);
    setError('');
    setLoading(false);
    if (!canRead || !validMonth(month)) return;
    setLoading(true);
    scheduleRequest<{ schedules: ScheduleEntry[] }>(`?month=${encodeURIComponent(month)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (active) {
          setSchedules(result.schedules);
          setLoaded(true);
        }
      })
      .catch((cause) => {
        if (!active) return;
        setError((cause as Error).message);
        if (cause instanceof ApiError && cause.status === 401) void refresh();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [month, user?.id, user?.role, user?.sectorId, canRead, reload, refresh]);

  useEffect(() => {
    if (error) errorNode.current?.focus();
  }, [error]);

  function chooseSlot(change: Partial<Pick<Draft, 'sectorId' | 'date' | 'shift'>>) {
    const next = { ...draft, ...change };
    const existing = schedules.find((item) => scheduleKey(item) === scheduleKey(next));
    setDraft({ ...next, team: existing?.team ?? '', expectedVersion: existing?.version ?? 0 });
    setConflict(false);
    setNotice('');
  }

  function edit(entry: ScheduleEntry) {
    setDraft({
      sectorId: entry.sectorId,
      date: entry.date,
      shift: entry.shift,
      team: entry.team,
      expectedVersion: entry.version,
    });
    setConflict(false);
    setNotice('Escala carregada no formulário. Confira a equipe antes de salvar.');
    teamNode.current?.focus();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !loaded || busy.current || conflict) return;
    if (!csrfToken) {
      setError('Sua sessão precisa ser atualizada. Entre novamente antes de salvar.');
      return;
    }
    busy.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { schedule } = await scheduleRequest<{ schedule: ScheduleEntry }>('', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ ...draft, team: draft.team.trim() }),
      });
      setSchedules((previous) => [
        ...previous.filter((item) => scheduleKey(item) !== scheduleKey(schedule)),
        schedule,
      ]);
      setDraft({ ...draft, team: schedule.team, expectedVersion: schedule.version });
      setNotice(
        'Escala salva. A equipe será associada aos atendimentos deste setor, data e turno.',
      );
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof ApiError) {
        if (cause.status === 409) setConflict(true);
        if (cause.status === 401) void refresh();
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!canRead)
    return (
      <div className="empty-state">
        <h1>Acesso restrito às escalas</h1>
        <p>Super Admin, Admin de Setor e Gestão podem consultar as equipes por mês.</p>
        <a className="button primary" href="#/painel?dados=servidor">
          Voltar ao painel
        </a>
      </div>
    );

  const ordered = [...schedules].sort((a, b) =>
    `${a.date}/${a.sectorId}/${Object.keys(shiftNames).indexOf(a.shift)}`.localeCompare(
      `${b.date}/${b.sectorId}/${Object.keys(shiftNames).indexOf(b.shift)}`,
    ),
  );
  const existing = schedules.some((item) => scheduleKey(item) === scheduleKey(draft));
  const needsEdit = existing && draft.expectedVersion === 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = validMonth(month) ? new Date(year, monthNumber, 0).getDate() : 1;

  return (
    <div className="schedules-page">
      <div className="page-heading">
        <div>
          <h1>Escalas mensais</h1>
          <p>Organize as equipes por setor, data e turno.</p>
        </div>
      </div>
      <p className="schedules-context">
        A escala identifica o contexto do atendimento e não atribui responsabilidade individual. Sem
        data, turno ou escala correspondente, a equipe fica sem identificação. Use rótulos fictícios
        de equipe, sem nomes de profissionais.
      </p>
      <div className="schedule-toolbar">
        <label htmlFor="schedule-month">
          Mês da escala
          <input
            id="schedule-month"
            type="month"
            min="2000-01"
            max="2099-12"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            disabled={saving}
            required
          />
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={loading || saving || !validMonth(month)}
          onClick={() => setReload((value) => value + 1)}
        >
          Recarregar mês
        </button>
      </div>
      {error && (
        <p ref={errorNode} className="error-message" role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      {notice && (
        <p className="status-message" role="status">
          {notice}
        </p>
      )}
      <div className={`schedules-layout${canEdit ? '' : ' schedules-readonly'}`}>
        {canEdit && (
          <section className="panel schedule-editor" aria-labelledby="schedule-form-title">
            <h2 id="schedule-form-title">
              {draft.expectedVersion ? 'Editar escala' : 'Cadastrar escala'}
            </h2>
            <form onSubmit={save} aria-busy={saving}>
              <fieldset disabled={loading || saving || !loaded}>
                <legend className="sr-only">Dados da equipe por setor, data e turno</legend>
                <label htmlFor="schedule-sector">
                  Setor da escala
                  <select
                    id="schedule-sector"
                    value={draft.sectorId}
                    onChange={(event) => chooseSlot({ sectorId: event.target.value as SectorId })}
                    required
                  >
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id}>
                        {sector.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="schedule-date">
                  Data do atendimento
                  <input
                    id="schedule-date"
                    type="date"
                    value={draft.date}
                    min={`${month}-01`}
                    max={`${month}-${String(lastDay).padStart(2, '0')}`}
                    onChange={(event) => chooseSlot({ date: event.target.value })}
                    required
                  />
                </label>
                <label htmlFor="schedule-shift">
                  Turno da escala
                  <select
                    id="schedule-shift"
                    value={draft.shift}
                    onChange={(event) =>
                      chooseSlot({ shift: event.target.value as ScheduleEntry['shift'] })
                    }
                    required
                  >
                    {Object.entries(shiftNames).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="schedule-team">
                  Equipe
                  <input
                    ref={teamNode}
                    id="schedule-team"
                    value={draft.team}
                    onChange={(event) => setDraft({ ...draft, team: event.target.value })}
                    placeholder="Equipe A (exemplo)"
                    aria-describedby="schedule-team-help"
                    autoComplete="off"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <p className="small muted" id="schedule-team-help">
                  Informe somente o rótulo da equipe. Não inclua dados pessoais.
                </p>
                {needsEdit && (
                  <p className="small">
                    Já existe uma escala neste horário. Use “Editar” na tabela.
                  </p>
                )}
                <button className="button primary" disabled={conflict || needsEdit}>
                  {saving ? 'Salvando escala…' : 'Salvar escala'}
                </button>
              </fieldset>
            </form>
          </section>
        )}
        <section className="panel schedule-list" aria-labelledby="schedule-table-title">
          <div className="panel-heading">
            <h2 id="schedule-table-title">Escalas do mês</h2>
            {!loading && loaded && (
              <span className="badge">
                {ordered.length} {ordered.length === 1 ? 'registro' : 'registros'}
              </span>
            )}
          </div>
          {loading ? (
            <p role="status">Carregando escalas…</p>
          ) : !validMonth(month) ? (
            <p className="muted">Escolha um mês para consultar as escalas.</p>
          ) : loaded && !ordered.length ? (
            <p className="muted">Nenhuma equipe cadastrada neste mês.</p>
          ) : loaded ? (
            <>
              <p className="schedule-scroll-hint small muted" id="schedule-scroll-help">
                Se necessário, deslize a tabela para os lados para ver todas as colunas.
              </p>
              <div
                className="schedule-table-wrap"
                role="region"
                aria-labelledby="schedule-table-title"
                aria-describedby="schedule-scroll-help"
                tabIndex={0}
              >
                <table>
                  <caption className="sr-only">Equipes cadastradas no mês {month}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Setor</th>
                      <th scope="col">Turno</th>
                      <th scope="col">Equipe</th>
                      {canEdit && <th scope="col">Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((entry) => (
                      <tr key={scheduleKey(entry)}>
                        <td>
                          <time dateTime={entry.date}>
                            {entry.date.split('-').reverse().join('/')}
                          </time>
                        </td>
                        <td>{sectorName(entry.sectorId)}</td>
                        <td>{shiftNames[entry.shift]}</td>
                        <td className="schedule-team-cell">{entry.team}</td>
                        {canEdit && (
                          <td>
                            <button
                              type="button"
                              className="text-button"
                              disabled={saving || loading}
                              aria-label={`Editar escala de ${sectorName(entry.sectorId)}, ${entry.date.split('-').reverse().join('/')}, ${shiftNames[entry.shift]}`}
                              onClick={() => edit(entry)}
                            >
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">Use “Recarregar mês” para tentar a consulta novamente.</p>
          )}
        </section>
      </div>
    </div>
  );
}
