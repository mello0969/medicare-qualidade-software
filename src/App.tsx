import { Component, useEffect, useState, type ReactNode } from 'react';
import {
  SquaresFour,
  ClipboardText,
  ChartBar,
  ChatCircleText,
  Buildings,
  CalendarBlank,
  Key,
  SignOut,
  CheckCircle,
  LinkSimple,
  ArrowSquareOut,
  Info,
  Users,
  List,
  X,
  ShieldCheck,
  Monitor,
} from '@phosphor-icons/react';
import Survey from './Survey';
import AuditPage from './AuditPage';
import Dashboard from './Dashboard';
import { SECTORS, sectorName, type Question, type QuestionSectorId } from './domain';
import { loadQuestions, saveQuestions } from './storage';
import Login, { AuthProvider, useAuth } from './Auth';
import { ApiError, getQuestions, updateQuestions, createQuestion } from './api';
import UsersPage from './Users';
import Brand from './Brand';
import PasswordChange from './PasswordChange';
import { OmbudsmanPage, SettingsPage } from './Administration';
import SurveyLinks from './SurveyLinks';
import TVWall from './TVWall';
import { ROLE_LABELS } from './access';
import Schedules from './SchedulesPage';

const nav = [
  { path: '/painel', label: 'Painel', icon: SquaresFour },
  { path: '/relatorios', label: 'Relatórios', icon: ChartBar },
  { path: '/pesquisas', label: 'Pesquisas', icon: ClipboardText },
  { path: '/setores', label: 'Setores e equipes', icon: Buildings },
  { path: '/escalas', label: 'Escalas', icon: CalendarBlank },
  { path: '/usuarios', label: 'Usuários', icon: Users },
  { path: '/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { path: '/tv-wall', label: 'TV Wall', icon: Monitor },
];
const extraNav = [
  { path: '/perguntas', label: 'Editar perguntas' },
  { path: '/configuracoes', label: 'Mensagens da pesquisa' },
  { path: '/ouvidoria', label: 'Ouvidoria' },
  { path: '/qualidade', label: 'Qualidade do software' },
];
function canVisit(role: string | undefined, path: string) {
  if (path === '/auditoria') return role === 'manager';
  if (path === '/usuarios' || path === '/configuracoes') return role === 'manager';
  if (path === '/ouvidoria') return role === 'manager' || role === 'ombudsman';
  if (path === '/perguntas') return role === 'manager' || role === 'sector-admin';
  if (['/escalas', '/setores', '/relatorios'].includes(path))
    return ['manager', 'sector-admin', 'management'].includes(role ?? '');
  return true;
}
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const listener = () => setRoute(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  return route;
}

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
      <AuthProvider>
        <Application />
      </AuthProvider>
    </ErrorBoundary>
  );
}
function Application() {
  const { user, signOut } = useAuth();
  const route = useRoute();
  const path = route.split('?')[0];
  const params = new URLSearchParams(route.split('?')[1]);
  const localMode = params.get('modo') === 'local';
  const [menu, setMenu] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  async function leave() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await signOut();
      location.hash = '/';
    } catch (err) {
      setLogoutError((err as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
    document.title = `FHDOD · ${user?.mustChangePassword ? 'Defina sua senha' : path.startsWith('/pesquisa/') || path === '/pesquisa' ? 'Sua experiência' : !user && (path === '/' || path === '/login') ? 'Acesso à gestão' : (nav.find((n) => n.path === path)?.label ?? 'Visão geral')}`;
  }, [path, user?.id, user?.mustChangePassword]);
  if (user && (user.mustChangePassword || path === '/trocar-senha')) return <PasswordChange />;
  if (path === '/tv-wall') return <TVWall demo={params.get('dados') === 'exemplo'} />;
  if (path === '/pesquisa' || path.startsWith('/pesquisa/'))
    return (
      <Survey key={`${path}-${localMode}`} sector={path.split('/')[2]} localMode={localMode} />
    );
  if (
    path === '/login' ||
    (!user &&
      !localMode &&
      [
        '/',
        '/painel',
        '/perguntas',
        '/usuarios',
        '/relatorios',
        '/auditoria',
        '/setores',
        '/trocar-senha',
        '/ouvidoria',
        '/configuracoes',
        '/escalas',
      ].includes(path))
  )
    return (
      <main className="access-page">
        <Login />
        <footer className="access-footer">
          <p>Protótipo acadêmico · use dados fictícios. Sem integração com os sistemas da FHDOD.</p>
          <a href="https://www.fhdod.com.br/" target="_blank" rel="noreferrer">
            Site oficial da Fundação Hospitalar Dr. Oswaldo Diesel
          </a>
        </footer>
      </main>
    );
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
      <div className="management-body">
        <header className="institutional">
          <div className="institutional-inner">
            <Brand />
            <span className="product-name">
              Gestão da Experiência
              <br />
              do Paciente
            </span>
            <div className="account-actions">
              {user ? (
                <>
                  <span>
                    <strong>{user.name}</strong>
                    <small>{ROLE_LABELS[user.role]}</small>
                  </span>
                  <a href="#/trocar-senha">
                    <Key />
                    Trocar senha
                  </a>
                  <button onClick={leave} disabled={loggingOut}>
                    <SignOut />
                    {loggingOut ? 'Saindo…' : 'Sair'}
                  </button>
                </>
              ) : (
                <a href="#/login">Entrar na gestão</a>
              )}
              <button
                className="nav-toggle"
                aria-label={menu ? 'Fechar navegação' : 'Abrir navegação'}
                aria-expanded={menu}
                aria-controls="admin-nav"
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X /> : <List />}
              </button>
            </div>
          </div>
        </header>
        <nav
          className={'admin-nav ' + (menu ? 'open' : '')}
          id="admin-nav"
          aria-label="Navegação principal"
        >
          <div>
            {nav
              .filter(
                (n) =>
                  canVisit(user?.role, n.path) ||
                  (!user && path === '/demonstracao' && n.path === '/relatorios'),
              )
              .map((n) => (
                <a
                  key={n.path}
                  href={
                    !user && path === '/demonstracao' && ['/painel', '/relatorios'].includes(n.path)
                      ? '#/demonstracao' + (n.path === '/relatorios' ? '?visao=relatorios' : '')
                      : '#' + n.path
                  }
                  aria-current={
                    path === n.path ||
                    (n.path === '/painel' && ['/', '/demonstracao'].includes(path))
                      ? 'page'
                      : undefined
                  }
                >
                  <n.icon />
                  {n.label}
                </a>
              ))}
          </div>
        </nav>
        <main id="conteudo" tabIndex={-1} className="main-content">
          {logoutError && (
            <p className="error-message" role="alert">
              {logoutError}
            </p>
          )}
          {!canVisit(user?.role, path) && !(path === '/perguntas' && localMode && !user) ? (
            <div className="empty-state">
              <ShieldCheck size={40} aria-hidden="true" />
              <h1>Seu perfil não tem acesso a esta área.</h1>
              <a href="#/painel" className="button primary">
                Voltar ao painel
              </a>
            </div>
          ) : path === '/' ||
            path === '/painel' ||
            path === '/demonstracao' ||
            path === '/relatorios' ? (
            user && ['viewer', 'ombudsman'].includes(user.role) && path !== '/demonstracao' ? (
              <TVWall embedded />
            ) : (
              <Dashboard
                key={
                  (user?.id ?? 'demo') +
                  (path === '/demonstracao' ? 'exemplo' : (params.get('dados') ?? ''))
                }
                report={
                  path === '/relatorios' ||
                  (path === '/demonstracao' && params.get('visao') === 'relatorios')
                }
                requestedMode={path === '/demonstracao' ? 'exemplo' : (params.get('dados') ?? '')}
              />
            )
          ) : path === '/pesquisas' ? (
            <SurveyLinks />
          ) : path === '/perguntas' ? (
            <QuestionEditor localMode={localMode} />
          ) : path === '/qualidade' ? (
            <Quality />
          ) : path === '/login' ? (
            <Login />
          ) : path === '/usuarios' ? (
            <UsersPage />
          ) : path === '/ouvidoria' ? (
            <OmbudsmanPage />
          ) : path === '/configuracoes' ? (
            <SettingsPage />
          ) : path === '/auditoria' ? (
            <AuditPage />
          ) : path === '/escalas' || path === '/setores' ? (
            <Schedules directory={path === '/setores'} />
          ) : (
            <div className="empty-state">
              <h1>Página não encontrada</h1>
              <a href="#/" className="button primary">
                Voltar ao painel
              </a>
            </div>
          )}
        </main>
        <nav className="support-nav" aria-label="Outros recursos">
          {extraNav
            .filter((n) => canVisit(user?.role, n.path))
            .map((n) => (
              <a key={n.path} href={'#' + n.path}>
                {n.label}
              </a>
            ))}
        </nav>
        <footer className="app-footer">
          <span>FHDOD · Três Coroas/RS · Projeto acadêmico</span>
          <span>Use somente dados fictícios.</span>
        </footer>
      </div>
    </div>
  );
}

function QuestionEditor({ localMode }: { localMode: boolean }) {
  const { user, csrfToken, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [sector, setSector] = useState<string>(user?.sectorId ?? 'recepcao');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [newText, setNewText] = useState('');
  useEffect(() => {
    let active = true;
    setQuestions([]);
    setDrafts({});
    setError('');
    if (!localMode && !user) return;
    if (user?.sectorId && !localMode) setSector(user.sectorId);
    setLoading(true);
    void (async () => {
      try {
        const q = localMode ? loadQuestions() : await getQuestions();
        if (active) {
          setQuestions(q);
          setDrafts(Object.fromEntries(q.map((x) => [x.id, x.text])));
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [localMode, user?.id, reload]);
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
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      if (localMode && JSON.stringify(loadQuestions()) !== JSON.stringify(questions))
        throw new Error('As perguntas mudaram em outra aba. Recarregue a página antes de editar.');
      const proposed = questions.map((q) =>
        drafts[q.id].trim() === q.text
          ? q
          : { ...q, text: drafts[q.id].trim(), version: q.version + (localMode ? 1 : 0) },
      );
      const updated = localMode
        ? proposed
        : await updateQuestions(
            proposed,
            Object.fromEntries(questions.map((q) => [q.id, q.version])),
            csrfToken ?? '',
          );
      if (localMode) saveQuestions(updated);
      setQuestions(updated);
      setDrafts(Object.fromEntries(updated.map((q) => [q.id, q.text])));
      setStatus('Perguntas salvas. Novas pesquisas usarão esta versão.');
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 401) void refreshAuth();
    } finally {
      setSaving(false);
    }
  }
  if (!localMode && !user)
    return (
      <div className="empty-state">
        <ShieldCheck size={40} aria-hidden="true" />
        <h1>As perguntas têm acesso administrativo.</h1>
        <p>Entre para editar as perguntas dos setores sob sua responsabilidade.</p>
        <a className="button primary" href="#/login">
          Entrar na gestão
        </a>
        <a className="text-link" href="#/perguntas?modo=local">
          Experimentar edição local
        </a>
        {authLoading && <p role="status">Verificando acesso…</p>}
      </div>
    );
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
          {localMode
            ? 'Edição local de demonstração. As mudanças valem apenas neste navegador.'
            : user?.role === 'sector-admin'
              ? `Sua conta pode editar somente as perguntas de ${sectorName(user.sectorId ?? '')}.`
              : 'As mudanças são compartilhadas com as novas pesquisas de todos os setores.'}{' '}
          As respostas anteriores preservam a pergunta e a versão que foram respondidas.
        </p>
      </div>
      {loading && (
        <p className="status-message" role="status">
          Carregando perguntas…
        </p>
      )}
      <form className="editor" onSubmit={save} aria-busy={loading || saving}>
        <label className="editor-sector">
          Setor da pesquisa
          <select
            disabled={loading || saving}
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setStatus('');
            }}
          >
            {SECTORS.filter(
              (s) => localMode || user?.role === 'manager' || s.id === user?.sectorId,
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {(localMode || user?.role === 'manager') && (
              <option value="geral">Perguntas gerais do hospital</option>
            )}
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
                disabled={saving}
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
          <div className="editor-button-group">
            <button
              type="button"
              className="button secondary"
              disabled={loading || saving}
              onClick={() => {
                setStatus('');
                setReload((n) => n + 1);
              }}
            >
              {dirty ? 'Descartar alterações e recarregar' : 'Recarregar perguntas'}
            </button>
            <button className="button primary" disabled={!dirty || loading || saving}>
              {saving ? 'Salvando…' : 'Salvar perguntas'}
            </button>
          </div>
        </div>
      </form>
      {!localMode && (
        <form
          className="editor new-question-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving || dirty) return;
            setSaving(true);
            setError('');
            setStatus('');
            try {
              await createQuestion(newText.trim(), sector as QuestionSectorId, csrfToken ?? '');
              const list = await getQuestions();
              setQuestions(list);
              setDrafts(Object.fromEntries(list.map((q) => [q.id, q.text])));
              setNewText('');
              setStatus('Pergunta adicionada. As próximas pesquisas usarão esta pergunta.');
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <h2>Adicionar uma pergunta</h2>
          <p className="muted small">
            {sector === 'geral'
              ? 'Perguntas gerais aparecem depois das específicas, em todas as pesquisas.'
              : `Esta pergunta será aplicada a ${sectorName(sector)}.`}{' '}
            Salve as alterações existentes antes de adicionar.
          </p>
          <label>
            Nova pergunta
            <textarea
              minLength={8}
              maxLength={160}
              required
              rows={2}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              disabled={saving || loading}
            />
          </label>
          <button
            className="button primary"
            disabled={saving || loading || dirty || questions.length >= 60}
          >
            Adicionar pergunta
          </button>
        </form>
      )}
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
      'Sessões, perfis e contato autorizado',
      'Verificar troca de senha, acesso por setor e separação dos dados de contato.',
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
              <th>Aplicação no projeto FHDOD</th>
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
