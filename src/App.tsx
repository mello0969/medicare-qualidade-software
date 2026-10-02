import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SquaresFour,
  ClipboardText,
  ChartBar,
  ChatCircleText,
  SlidersHorizontal,
  DownloadSimple,
  CaretRight,
  CheckCircle,
  Copy,
  LinkSimple,
  ArrowSquareOut,
  Heart,
  Info,
  Users,
  List,
  X,
  FirstAid,
  ShieldCheck,
} from '@phosphor-icons/react';
import Survey from './Survey';
import {
  SECTORS,
  EMPTY_FILTERS,
  calculateMetrics,
  createDemoResponses,
  filterResponses,
  sectorSummary,
  sectorName,
  localDate,
  type Filters,
  type Question,
  type SurveyResponse,
} from './domain';
import { loadQuestions, loadResponses, saveQuestions } from './storage';
import { exportExcel } from './export';

const nav = [
  { path: '/', label: 'Visão geral', icon: SquaresFour },
  { path: '/pesquisas', label: 'Pesquisas por setor', icon: ClipboardText },
  { path: '/perguntas', label: 'Editar perguntas', icon: SlidersHorizontal },
  { path: '/qualidade', label: 'Qualidade do software', icon: ShieldCheck },
];
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const listener = () => setRoute(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  return route;
}
const formatNumber = (n: number) => n.toLocaleString('pt-BR');
const signed = (n: number | null) => (n === null ? '—' : n > 0 ? `+${n}` : String(n));

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="simple-page">
        <h1>Não conseguimos abrir esta tela.</h1>
        <p>Recarregue a página para tentar novamente. Não apague os dados do navegador.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <Application />
    </ErrorBoundary>
  );
}
function Application() {
  const route = useRoute();
  const path = route.split('?')[0];
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
    document.title = `MediCare · ${path.startsWith('/pesquisa/') || path === '/pesquisa' ? 'Sua experiência' : (nav.find((n) => n.path === path)?.label ?? 'Visão geral')}`;
  }, [path]);
  if (path === '/pesquisa' || path.startsWith('/pesquisa/'))
    return <Survey key={path} sector={path.split('/')[2]} />;
  const current = nav.find((n) => n.path === path);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#conteudo"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('conteudo')?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <a className="brand light" href="#/">
          <span className="brand-mark">M</span>MediCare<span className="brand-dot">.</span>
        </a>
        <p className="sidebar-subtitle">Escuta e cuidado</p>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <a
              key={n.path}
              href={`#${n.path}`}
              aria-current={
                path === n.path || (n.path === '/' && path === '/painel') ? 'page' : undefined
              }
            >
              <n.icon size={21} weight={path === n.path ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Heart size={25} weight="light" aria-hidden="true" />
            <p>Cada resposta é uma oportunidade de cuidar melhor.</p>
          </div>
          <div className="workspace-label">
            <span className="workspace-avatar">MC</span>
            <span>
              Projeto integrado<small>Ambiente acadêmico</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={menu ? 'Fechar navegação' : 'Abrir navegação'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={22} /> : <List size={22} />}
            </button>
            <span>Espaço de gestão</span>
            <CaretRight size={14} aria-hidden="true" />
            <strong>{current?.label ?? 'Visão geral'}</strong>
          </div>
          <span className="prototype-badge">Protótipo acadêmico</span>
        </header>
        <main id="conteudo" tabIndex={-1} className="main-content">
          {path === '/' || path === '/painel' ? (
            <Dashboard forceLocal={route.includes('dados=locais')} />
          ) : path === '/pesquisas' ? (
            <SurveyLinks />
          ) : path === '/perguntas' ? (
            <QuestionEditor />
          ) : path === '/qualidade' ? (
            <Quality />
          ) : (
            <div className="empty-state">
              <h1>Página não encontrada</h1>
              <a href="#/" className="button primary">
                Voltar ao painel
              </a>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>MediCare · Projeto integrado de qualidade de software</span>
          <span>Versão 0.1 · Desenvolvimento por etapas</span>
        </footer>
      </div>
    </div>
  );
}

function Dashboard({ forceLocal }: { forceLocal: boolean }) {
  const [mode, setMode] = useState<'demo' | 'local'>(forceLocal ? 'local' : 'demo');
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const demo = useMemo(() => createDemoResponses(), []);
  useEffect(() => {
    if (forceLocal) setMode('local');
  }, [forceLocal]);
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
  }, []);
  const source = mode === 'demo' ? demo : responses;
  const invalidRange = !!(filters.from && filters.to && filters.from > filters.to);
  const filtered = useMemo(
    () => (invalidRange ? [] : filterResponses(source, filters)),
    [source, filters, invalidRange],
  );
  const metrics = calculateMetrics(filtered);
  const sectors = sectorSummary(filtered).filter(
    (s) => !filters.sectorId || s.id === filters.sectorId,
  );
  const doctors = [...new Set(source.map((r) => r.doctor).filter(Boolean))].sort();
  const updateFilter = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  async function download() {
    setExporting(true);
    setNotice('');
    try {
      await exportExcel(
        filtered,
        mode === 'demo'
          ? 'Dados sintéticos de demonstração'
          : 'Respostas armazenadas neste navegador',
        filters,
      );
      setNotice('Planilha Excel gerada com os filtros selecionados.');
    } catch {
      setNotice('Não foi possível gerar a planilha. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Visão geral</h1>
          <p>Uma escuta mais próxima. Um cuidado cada vez melhor.</p>
        </div>
        <button
          className="button secondary"
          onClick={download}
          disabled={exporting || !filtered.length || invalidRange || (mode === 'local' && !!error)}
        >
          <DownloadSimple size={19} aria-hidden="true" />
          {exporting ? 'Gerando Excel…' : 'Exportar Excel'}
        </button>
      </div>
      <div className="data-mode">
        <div>
          <Info size={20} aria-hidden="true" />
          <p>
            {mode === 'demo' ? (
              <>
                <strong>Você está explorando dados de exemplo.</strong> Nenhum indicador representa
                um hospital real.
              </>
            ) : (
              <>
                <strong>Respostas deste navegador.</strong> Ainda não há sincronização entre
                dispositivos ou controle de acesso.
              </>
            )}
          </p>
        </div>
        <label className="sr-only" htmlFor="data-mode">
          Origem dos dados
        </label>
        <select
          id="data-mode"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'demo' | 'local');
            setFilters({ ...EMPTY_FILTERS });
            setNotice('');
          }}
        >
          <option value="demo">Dados de exemplo</option>
          <option value="local">Respostas deste navegador</option>
        </select>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="status-message" role="status">
          {notice}
        </p>
      )}
      <form className="filters" onSubmit={(e) => e.preventDefault()} aria-label="Filtros do painel">
        <label>
          Setor
          <select
            value={filters.sectorId}
            onChange={(e) => updateFilter('sectorId', e.target.value)}
          >
            <option value="">Todos os setores</option>
            {SECTORS.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plantão
          <select value={filters.shift} onChange={(e) => updateFilter('shift', e.target.value)}>
            <option value="">Todos os plantões</option>
            <option value="par">Par</option>
            <option value="impar">Ímpar</option>
            <option value="nao-informado">Não informado</option>
          </select>
        </label>
        <label>
          Profissional
          <select value={filters.doctor} onChange={(e) => updateFilter('doctor', e.target.value)}>
            <option value="">Todos os profissionais</option>
            {doctors.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter('from', e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter('to', e.target.value)}
          />
        </label>
        {Object.values(filters).some(Boolean) && (
          <button className="text-button" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
            Limpar
          </button>
        )}
      </form>
      {invalidRange && (
        <p role="alert" className="error-message">
          A data inicial deve ser anterior ou igual à data final.
        </p>
      )}
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
      {!filtered.length ? (
        <div className="empty-state">
          <ClipboardText size={40} aria-hidden="true" />
          <h2>
            {source.length
              ? 'Nenhuma resposta com esses filtros'
              : 'Sua primeira resposta começa aqui'}
          </h2>
          <p>
            {source.length
              ? 'Altere o período ou limpe os filtros para ver outros resultados.'
              : 'Abra a pesquisa, responda e volte ao painel para acompanhar os resultados.'}
          </p>
          {source.length ? (
            <button className="button secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
              Limpar filtros
            </button>
          ) : (
            <a className="button primary" href="#/pesquisa">
              Responder pesquisa
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="dashboard-grid">
            <section className="panel nps-panel">
              <div className="panel-heading">
                <h2>Quem passa por aqui, recomenda?</h2>
                <span className="badge">NPS</span>
              </div>
              <div className="nps-overview">
                <div className="nps-score">
                  <strong>{signed(metrics.nps)}</strong>
                  <span>Índice de recomendação</span>
                  <small>Escala de −100 a +100</small>
                </div>
                <div className="nps-breakdown">
                  <p>“Você recomendaria o hospital a um familiar?”</p>
                  <div className="distribution" aria-hidden="true">
                    {(['promoters', 'passives', 'detractors'] as const).map((k) => (
                      <span
                        key={k}
                        className={k}
                        style={{
                          width: `${metrics.npsResponses ? (metrics[k] / metrics.npsResponses) * 100 : 0}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="distribution-legend">
                    {[
                      { key: 'promoters', label: 'Promotores', range: '9–10' },
                      { key: 'passives', label: 'Neutros', range: '7–8' },
                      { key: 'detractors', label: 'Detratores', range: '0–6' },
                    ].map((g) => (
                      <div key={g.key}>
                        <span className={`legend-dot ${g.key}`} />
                        <strong>{metrics[g.key as 'promoters']}</strong>
                        <span>
                          {g.label}
                          <small>Notas {g.range}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <details className="calculation">
                <summary>Como esse indicador é calculado</summary>
                <p>
                  NPS = (% de promotores) − (% de detratores). Aqui, {metrics.npsResponses}{' '}
                  respostas têm nota de recomendação. Perguntas puladas não entram no cálculo. O
                  resultado é arredondado para o inteiro mais próximo; não é uma certificação de
                  qualidade.
                </p>
              </details>
            </section>
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
                <p className="muted">As respostas deste recorte ainda não têm comentários.</p>
              )}
              <p className="comment-caption">
                Até 3 comentários recentes ·{' '}
                {mode === 'demo' ? 'textos fictícios' : 'sem identificação solicitada'}
              </p>
            </section>
          </div>
        </>
      )}
      <section className="next-survey">
        <div className="next-survey-icon">
          <ClipboardText size={28} aria-hidden="true" />
        </div>
        <div>
          <h2>Uma pesquisa simples, em cada setor.</h2>
          <p>Abra a experiência do paciente e veja como é fácil responder.</p>
        </div>
        <a className="button primary" href="#/pesquisa">
          Responder pesquisa
          <ArrowSquareOut size={18} aria-hidden="true" />
        </a>
      </section>
    </>
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

function SurveyLinks() {
  const [status, setStatus] = useState('');
  async function copy(id: string) {
    const url = new URL(location.href);
    url.hash = `/pesquisa/${id}`;
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus(`Link de ${sectorName(id)} copiado.`);
    } catch {
      setStatus(
        'Não foi possível copiar automaticamente. Selecione o endereço do setor e copie manualmente.',
      );
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Pesquisas por setor</h1>
          <p>Um caminho direto para cada experiência de atendimento.</p>
        </div>
        <a className="button primary" href="#/pesquisa">
          Pesquisa completa
        </a>
      </div>
      <div className="notice">
        <Info size={22} aria-hidden="true" />
        <p>
          Os links abaixo abrem a pesquisa nesta instalação. Nesta versão, respostas de outros
          dispositivos ainda não chegam ao seu painel.
        </p>
      </div>
      {status && (
        <p role="status" className="status-message">
          {status}
        </p>
      )}
      <div className="sector-link-list">
        {SECTORS.map((s, i) => (
          <article key={s.id}>
            <span className="sector-number">{String(i + 1).padStart(2, '0')}</span>
            <div className="sector-link-info">
              <h2>{s.name}</h2>
              <p>{s.description} · 2 perguntas e recomendação</p>
              <label className="sr-only" htmlFor={`url-${s.id}`}>
                URL de {s.name}
              </label>
              <input
                id={`url-${s.id}`}
                readOnly
                value={`${location.href.split('#')[0]}#/pesquisa/${s.id}`}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="link-actions">
              <button className="button secondary" onClick={() => copy(s.id)}>
                <Copy size={18} aria-hidden="true" />
                Copiar link
              </button>
              <a className="button primary" href={`#/pesquisa/${s.id}`}>
                Abrir pesquisa
                <ArrowSquareOut size={18} aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </div>
      <div className="next-stage">
        <h2>Próxima etapa: do atendimento ao convite</h2>
        <p>
          O envio no dia seguinte depende da integração com os atendimentos e de um canal de
          comunicação autorizado. Nenhuma mensagem é enviada por esta versão.
        </p>
      </div>
    </>
  );
}

function QuestionEditor() {
  const [sector, setSector] = useState<string>('recepcao');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    try {
      const q = loadQuestions();
      setQuestions(q);
      setDrafts(Object.fromEntries(q.map((x) => [x.id, x.text])));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  const dirty = questions.some((q) => drafts[q.id]?.trim() !== q.text);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      const current = loadQuestions();
      if (JSON.stringify(current) !== JSON.stringify(questions))
        throw new Error('As perguntas mudaram em outra aba. Recarregue a página antes de editar.');
      const updated = questions.map((q) =>
        drafts[q.id].trim() === q.text
          ? q
          : { ...q, text: drafts[q.id].trim(), version: q.version + 1 },
      );
      saveQuestions(updated);
      setQuestions(updated);
      setDrafts(Object.fromEntries(updated.map((q) => [q.id, q.text])));
      setStatus('Perguntas salvas. Novas pesquisas usarão esta versão.');
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Perguntas que fazem sentido</h1>
          <p>Ajuste a linguagem da pesquisa à realidade de cada setor.</p>
        </div>
      </div>
      <div className="notice">
        <Info size={22} aria-hidden="true" />
        <p>
          Edição de demonstração, sem autenticação. As mudanças valem apenas neste navegador. As
          respostas anteriores preservam a pergunta e a versão que foram respondidas.
        </p>
      </div>
      <form className="editor" onSubmit={save}>
        <label className="editor-sector">
          Setor da pesquisa
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setStatus('');
            }}
          >
            {SECTORS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {questions
          .filter((q) => q.sectorId === sector)
          .map((q, i) => (
            <div className="question-edit" key={q.id}>
              <div>
                <label htmlFor={q.id}>Pergunta {i + 1}</label>
                <span className="badge">Versão {q.version}</span>
              </div>
              <textarea
                id={q.id}
                rows={2}
                required
                minLength={8}
                maxLength={160}
                value={drafts[q.id] ?? ''}
                onChange={(e) => {
                  setDrafts({ ...drafts, [q.id]: e.target.value });
                  setStatus('');
                }}
              />
              <small>
                Resposta em escala de 1 a 5 · {drafts[q.id]?.length ?? 0}/160 caracteres
              </small>
            </div>
          ))}
        <div className="fixed-question">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Pergunta de recomendação preservada</strong>
            <p>
              O NPS mantém a mesma pergunta e a escala de 0 a 10 em todos os setores para permitir
              comparações.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="status-message">
            <CheckCircle size={20} />
            {status}
          </p>
        )}
        <div className="editor-actions">
          <span className="muted small">
            {dirty ? 'Há alterações não salvas.' : 'Nenhuma alteração pendente.'}
          </span>
          <button className="button primary" disabled={!dirty}>
            Salvar perguntas
          </button>
        </div>
      </form>
    </>
  );
}

function Quality() {
  const rows = [
    [
      'Adequação funcional',
      'NPS, notas por setor e exportação',
      'Conferir fórmulas, filtros e conteúdo da planilha.',
    ],
    [
      'Eficiência de desempenho',
      'Interface leve e exportação sob demanda',
      'Medir carregamento e resposta em dispositivos reais.',
    ],
    [
      'Compatibilidade',
      'Navegador no celular, tablet e computador',
      'Validar em navegadores e sistemas diferentes.',
    ],
    [
      'Usabilidade',
      'Uma pergunta por vez, rostos e legendas',
      'Testar com usuários, incluindo pessoas idosas.',
    ],
    [
      'Confiabilidade',
      'Validação e preservação de respostas',
      'Verificar falhas de armazenamento e recuperação.',
    ],
    [
      'Segurança',
      'Sem identificadores clínicos nesta etapa',
      'Implementar autenticação, permissões e proteção do banco antes do uso real.',
    ],
    [
      'Manutenibilidade',
      'TypeScript, módulos e testes automatizados',
      'Manter regras de indicadores separadas das telas.',
    ],
    [
      'Portabilidade',
      'Aplicação web com build independente',
      'Conferir instalação e execução no ambiente escolhido.',
    ],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Qualidade que acompanha o projeto</h1>
          <p>A ISO/IEC 25010 como referência para decisões verificáveis.</p>
        </div>
        <span className="badge">Base didática: edição 2011</span>
      </div>
      <div className="quality-intro">
        <ShieldCheck size={34} aria-hidden="true" />
        <div>
          <h2>Do requisito à evidência</h2>
          <p>
            O material da atividade usa as oito características de qualidade de produto da edição de
            2011. Este mapa relaciona cada uma à implementação e às verificações necessárias. Não
            representa certificação ISO.
          </p>
          <p>
            A edição de 2023 revisa o modelo de produto; qualidade em uso passou a ser tratada na
            ISO/IEC 25019:2023. Mantemos a edição indicada na atividade para não misturar modelos.
          </p>
        </div>
      </div>
      <div
        className="quality-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Características de qualidade e critérios de verificação"
      >
        <table className="quality-table">
          <thead>
            <tr>
              <th>Característica</th>
              <th>Aplicação no MediCare</th>
              <th>Critério de verificação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th scope="row" key={i}>
                      {cell}
                    </th>
                  ) : (
                    <td key={i}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="quality-links">
        <a
          className="button secondary"
          href="https://github.com/mello0969/medicare-qualidade-software/tree/main/respostas"
          target="_blank"
          rel="noreferrer"
        >
          <LinkSimple size={18} />
          Respostas da atividade
          <ArrowSquareOut size={16} />
        </a>
        <a
          className="button secondary"
          href="https://github.com/mello0969/medicare-qualidade-software/tree/main/docs"
          target="_blank"
          rel="noreferrer"
        >
          <ClipboardText size={18} />
          Documentação e referências
          <ArrowSquareOut size={16} />
        </a>
      </div>
    </>
  );
}
