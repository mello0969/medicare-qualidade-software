import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { DownloadSimple, ChatCircleText, FirstAid, Heart, ChartBar } from '@phosphor-icons/react';
import { useAuth } from './Auth';
import { ApiError, getResponses } from './api';
import { ROLE_LABELS } from './access';
import {
  SECTORS,
  calculateMetrics,
  createDemoResponses,
  filterResponses,
  sectorSummary,
  sectorName,
  localDate,
  type Filters,
  type SurveyResponse,
} from './domain';
import { recentFilters, previousPeriod, displayDate } from './analytics';
import { loadResponses } from './storage';
import { exportExcel } from './export';
import DashboardFilters from './DashboardFilters';
import { IndicatorCards, ScoreCharts, SectorTable } from './DashboardResults';
const formatNumber = (n: number) => n.toLocaleString('pt-BR');
export default function Dashboard({
  requestedMode,
  report = false,
}: {
  requestedMode: string;
  report?: boolean;
}) {
  const { user, refresh: refreshAuth } = useAuth();
  const [mode, setMode] = useState<'demo' | 'local' | 'server'>(
    requestedMode === 'exemplo'
      ? 'demo'
      : requestedMode === 'locais'
        ? 'local'
        : requestedMode === 'servidor'
          ? 'server'
          : user
            ? 'server'
            : 'demo',
  );
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [serverResponses, setServerResponses] = useState<SurveyResponse[]>([]);
  const [serverError, setServerError] = useState('');
  const [fetching, setFetching] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(() => recentFilters());
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [compare, setCompare] = useState(false);
  const demo = useMemo(() => createDemoResponses(), [reload]);
  useEffect(() => {
    if (requestedMode === 'locais') setMode('local');
    if (requestedMode === 'servidor') setMode('server');
    if (requestedMode === 'exemplo') setMode('demo');
  }, [requestedMode]);
  useEffect(() => {
    setServerResponses([]);
    setServerError('');
    setUpdatedAt(null);
    if (mode !== 'server' || !user) {
      setFetching(false);
      return;
    }
    let active = true;
    let pending = false;
    const fetchData = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      setFetching(true);
      try {
        const data = await getResponses();
        if (active) {
          setServerResponses(data);
          setServerError('');
          setUpdatedAt(new Date().toLocaleTimeString('pt-BR'));
        }
      } catch (err) {
        if (active) {
          setServerError((err as Error).message);
          if (err instanceof ApiError && err.status === 401) await refreshAuth();
        }
      } finally {
        pending = false;
        if (active) setFetching(false);
      }
    };
    void fetchData();
    const timer = setInterval(fetchData, 15000);
    window.addEventListener('focus', fetchData);
    document.addEventListener('visibilitychange', fetchData);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', fetchData);
      document.removeEventListener('visibilitychange', fetchData);
    };
  }, [mode, user?.id, reload, refreshAuth]);
  useEffect(() => {
    const refresh = () => {
      try {
        setResponses(loadResponses());
        setError('');
      } catch (err) {
        setError((err as Error).message);
      }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('medicare-storage', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('medicare-storage', refresh);
    };
  }, [reload]);
  const source =
    mode === 'demo' ? demo : mode === 'server' ? (user ? serverResponses : []) : responses;
  const scoped = mode === 'server' && user?.role === 'sector-admin';
  const available = SECTORS.filter((s) => !scoped || s.id === user?.sectorId);
  const allowed = available
    .filter((s) => !filters.sectorId || s.id === filters.sectorId)
    .map((s) => s.id);
  const filtered = useMemo(() => filterResponses(source, filters), [source, filters]);
  const previous = useMemo(
    () => (compare ? filterResponses(source, previousPeriod(filters)) : undefined),
    [compare, source, filters],
  );
  const metrics = calculateMetrics(filtered);
  const sectors = sectorSummary(filtered).filter((s) => allowed.includes(s.id));
  const problem = mode === 'server' ? serverError : mode === 'local' ? error : '';
  const loading = mode === 'server' && !updatedAt && !problem && user;
  const modeLabel =
    mode === 'demo'
      ? 'Dados de exemplo'
      : mode === 'local'
        ? 'Respostas deste navegador'
        : 'Respostas no servidor';
  const period = displayDate(filters.from) + ' a ' + displayDate(filters.to);
  async function download(kind: 'respostas' | 'indicadores') {
    setExporting(true);
    setNotice('');
    try {
      await exportExcel(filtered, modeLabel, filters, { kind, allowed, previous });
      setNotice('Planilha gerada para o período selecionado.');
    } catch {
      setNotice('Não foi possível gerar a planilha. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="analytics-page">
      <div className="dash-heading">
        <div>
          <h1>{report ? 'Relatórios' : 'Olá, ' + (user?.name ?? 'visitante')}</h1>
          <p>
            {report ? 'Relatório de experiência' : 'Painel de indicadores'} · {period} ·{' '}
            {user ? ROLE_LABELS[user.role] : 'Demonstração'}
          </p>
          <p className="data-mode">
            {' '}
            {scoped
              ? 'Acesso restrito a ' + sectorName(user!.sectorId ?? '') + '.'
              : 'Escopo: todos os setores' +
                (mode === 'server' ? ' do hospital.' : ' da base de demonstração.')}
          </p>
        </div>
        <div className="export-actions">
          {(['respostas', 'indicadores'] as const).map((kind) => (
            <button
              key={kind}
              className="button secondary"
              disabled={
                exporting ||
                !!problem ||
                !!loading ||
                (mode === 'server' && !user) ||
                (kind === 'respostas' && !filtered.length)
              }
              onClick={() => download(kind)}
            >
              <DownloadSimple size={18} />
              Exportar {kind} (Excel)
            </button>
          ))}
        </div>
      </div>
      <DashboardFilters
        key={mode}
        value={filters}
        source={source}
        sectors={available}
        busy={fetching}
        onRefresh={() => setReload((n) => n + 1)}
        onApply={(next, c) => {
          setFilters(next);
          setCompare(c);
          setNotice('');
        }}
      />
      {compare && (
        <p>
          Período anterior: {displayDate(previousPeriod(filters).from)} a{' '}
          {displayDate(previousPeriod(filters).to)}.
        </p>
      )}
      {error && mode !== 'local' && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="status-message">
          {notice}
        </p>
      )}
      {mode === 'server' && !user ? (
        <p className="notice">
          <a href="#/login">Entre na gestão para consultar as respostas.</a>
        </p>
      ) : problem ? (
        <p role="alert" className="error-message">
          {problem} Use “Atualizar agora” para tentar novamente.
        </p>
      ) : loading ? (
        <p role="status">Buscando as respostas…</p>
      ) : (
        <>
          {!filtered.length && (
            <div className="empty-state">
              <h2>
                {source.length
                  ? 'Nenhuma resposta com esses filtros'
                  : 'Sua primeira resposta começa aqui'}
              </h2>
              <p>
                {source.length
                  ? 'Ajuste o período ou os filtros.'
                  : 'Os indicadores estarão disponíveis após o primeiro envio.'}
              </p>
            </div>
          )}
          {report ? (
            <>
              {previous && <IndicatorCards rows={filtered} previous={previous} />}
              <section className="metrics" aria-label="Indicadores de satisfação">
                <Metric
                  title="Respostas recebidas"
                  value={formatNumber(metrics.total)}
                  description="Pesquisas no período selecionado"
                  icon={<ChatCircleText size={23} />}
                />
                <Metric
                  title="Satisfação com os serviços"
                  value={metrics.satisfaction === null ? '—' : `${metrics.satisfaction}%`}
                  description={`${metrics.ratings} avaliações · notas 4 e 5 consideradas positivas`}
                  icon={<SmileyIcon />}
                />
                <Metric
                  title="Setores avaliados"
                  value={String(sectors.filter((s) => s.count).length).padStart(2, '0')}
                  description="Com pelo menos uma avaliação"
                  icon={<FirstAid size={23} />}
                />
              </section>
              <div className="quality-follow-up">
                <p>
                  <strong>
                    {
                      filtered.filter((response) =>
                        response.answers.some((answer) => answer.value <= 2),
                      ).length
                    }
                  </strong>{' '}
                  pesquisas com alguma nota 1 ou 2 no recorte atual.
                </p>
                {mode === 'server' && user?.role === 'manager' && (
                  <a className="text-link" href="#/ouvidoria">
                    Ver pedidos autorizados de contato
                  </a>
                )}
              </div>
              <div className="charts-grid">
                <section className="panel sectors-panel">
                  <div className="panel-heading">
                    <h2>Experiência por setor</h2>
                    <span className="muted small">Notas de 1 a 5</span>
                  </div>
                  <div className="sector-scores">
                    {sectors.map((s) => (
                      <div key={s.id}>
                        <div className="sector-score-label">
                          <span>{s.name}</span>
                          <strong>
                            {s.average === null ? '—' : s.average.toFixed(1).replace('.', ',')}
                            <small>{s.average !== null && ' / 5'}</small>
                          </strong>
                        </div>
                        <div className="sector-bar">
                          <span style={{ width: `${(s.average ?? 0) * 20}%` }} />
                        </div>
                        <small>{s.count} avaliações</small>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel trend-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>O ritmo da escuta</h2>
                      <p>Respostas por dia nos últimos 14 dias</p>
                    </div>
                    <ChartBar size={22} aria-hidden="true" />
                  </div>
                  <ResponseChart responses={filtered} />
                  <p className="chart-note">
                    Este gráfico usa o mesmo recorte de setores e plantões dos indicadores.
                  </p>
                </section>
              </div>
            </>
          ) : (
            <>
              <IndicatorCards rows={filtered} previous={previous} />
              <ScoreCharts rows={filtered} filters={filters} />
              <SectorTable rows={filtered} allowed={allowed} team={filters.team} />
            </>
          )}
          <section className="panel comments-panel">
            <div className="panel-heading">
              <h2>Vozes que ajudam a melhorar</h2>
              <ChatCircleText size={23} aria-hidden="true" />
            </div>
            {filtered
              .filter((r) => r.comment)
              .slice(0, 3)
              .map((r) => (
                <article className="comment" key={r.id}>
                  <p>“{r.comment}”</p>
                  <div>
                    <span>{r.sectorIds.map(sectorName).join(' · ')}</span>
                    <time dateTime={r.createdAt}>
                      {new Date(r.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </time>
                  </div>
                </article>
              ))}
            {!filtered.some((r) => r.comment) && (
              <p className="muted">
                {mode === 'server' && (user?.role === 'sector-admin' || user?.role === 'management')
                  ? 'Seu perfil não permite consultar comentários livres.'
                  : 'As respostas deste recorte ainda não têm comentários.'}
              </p>
            )}
            <p className="comment-caption">
              Até 3 comentários recentes ·{' '}
              {mode === 'demo' ? 'textos fictícios' : 'sem identificação solicitada'}
            </p>
          </section>
        </>
      )}
      <section className="source-settings">
        <label>
          Origem dos dados
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setFilters(recentFilters());
              setCompare(false);
              setNotice('');
            }}
          >
            <option value="demo">Dados de exemplo</option>
            <option value="local">Respostas deste navegador</option>
            <option value="server">Respostas no servidor</option>
          </select>
        </label>
        <p>
          {mode === 'server' && updatedAt
            ? 'Atualizado às ' + updatedAt + ' · atualização automática a cada 15 segundos'
            : modeLabel}
        </p>
        <a className="text-link" href="#/pesquisa">
          Responder pesquisa
        </a>
      </section>
    </div>
  );
}
function SmileyIcon() {
  return <Heart size={23} />;
}
function Metric({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        <h2>{title}</h2>
        <span aria-hidden="true">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{description}</p>
    </div>
  );
}
function ResponseChart({ responses }: { responses: SurveyResponse[] }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 13 + i);
    const key = localDate(d);
    return {
      key,
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count: responses.filter((r) => localDate(new Date(r.createdAt)) === key).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={`Respostas por dia: ${days.map((d) => `${d.label}: ${d.count}`).join('; ')}`}
      >
        <div className="chart-bars">
          {days.map((d, i) => (
            <div className="chart-column" key={d.key}>
              <span className="bar-count">{d.count}</span>
              <span
                className={`chart-bar ${i === 13 ? 'today' : ''}`}
                style={{ height: `${(d.count / max) * 132}px` }}
              />
              <span className="chart-date">{i % 3 === 0 || i === 13 ? d.label : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="chart-table">
        <summary>Ver valores do gráfico</summary>
        <table>
          <thead>
            <tr>
              <th>Dia</th>
              <th>Respostas</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
