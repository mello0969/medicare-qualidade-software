import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowsIn,
  ArrowsOut,
  ArrowSquareOut,
  ClipboardText,
} from '@phosphor-icons/react';
import Brand from './Brand';
import { createDemoResponses, SECTORS } from './domain';
import { buildWallSummary, WALL_MINIMUM_RESPONSES, type WallSummary } from './wall';
import './tv-wall.css';

const nullableNumber = (value: unknown, min: number, max: number) =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
const validDate = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
function validSummary(value: unknown): value is WallSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as WallSummary;
  return (
    validDate(summary.updatedAt) &&
    !!summary.period &&
    validDate(summary.period.from) &&
    validDate(summary.period.to) &&
    Number.isInteger(summary.minimumResponses) &&
    summary.minimumResponses >= WALL_MINIMUM_RESPONSES &&
    nullableNumber(summary.total, summary.minimumResponses, Number.MAX_SAFE_INTEGER) &&
    nullableNumber(summary.nps, -100, 100) &&
    nullableNumber(summary.satisfaction, 0, 100) &&
    Array.isArray(summary.sectors) &&
    summary.sectors.length === SECTORS.length &&
    new Set(summary.sectors.map((sector) => sector?.id)).size === SECTORS.length &&
    summary.sectors.every(
      (sector) =>
        sector &&
        SECTORS.some((known) => known.id === sector.id) &&
        nullableNumber(sector.responses, summary.minimumResponses, Number.MAX_SAFE_INTEGER) &&
        nullableNumber(sector.average, 1, 5) &&
        (sector.responses === null) === (sector.average === null),
    )
  );
}

export default function TVWall({
  demo = false,
  embedded = false,
}: {
  demo?: boolean;
  embedded?: boolean;
}) {
  const wall = useRef<HTMLElement>(null);
  const [summary, setSummary] = useState<WallSummary | null>(() =>
    demo ? buildWallSummary(createDemoResponses()) : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    setSummary(demo ? buildWallSummary(createDemoResponses()) : null);
    setLoading(!demo);
    setError('');
    async function refresh() {
      if (pending || document.visibilityState === 'hidden') return;
      if (demo) {
        setSummary(buildWallSummary(createDemoResponses()));
        return;
      }
      pending = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 20000);
      try {
        const response = await fetch('/api/wall', {
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('WALL_UNAVAILABLE');
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('summary' in payload) ||
          !validSummary(payload.summary)
        )
          throw new Error('INVALID_WALL');
        if (active) {
          setSummary(payload.summary);
          setError('');
        }
      } catch {
        if (active)
          setError(
            'Não foi possível atualizar. Tentaremos novamente automaticamente em 15 segundos.',
          );
      } finally {
        clearTimeout(timeout);
        pending = false;
        if (active) setLoading(false);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [demo]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === wall.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === wall.current) await document.exitFullscreen();
      else if (wall.current?.requestFullscreen) await wall.current.requestFullscreen();
      else
        setFullscreenError('Este navegador não oferece tela cheia. Use a ampliação do navegador.');
    } catch {
      setFullscreenError('Não foi possível abrir a tela cheia. Tente novamente neste navegador.');
    }
  }

  const minimum = summary?.minimumResponses ?? WALL_MINIMUM_RESPONSES;
  const number = (value: number | null | undefined) =>
    value == null ? '—' : value.toLocaleString('pt-BR');
  const date = (value: string) =>
    new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const Container = embedded ? 'section' : 'main';
  return (
    <Container
      className={`tv-wall${embedded ? ' tv-wall-embedded' : ''}`}
      ref={wall}
      id={embedded ? undefined : 'main-content'}
      aria-labelledby="wall-title"
    >
      {embedded ? (
        <nav className="wall-embedded-actions" aria-label="Ações dos indicadores">
          <a className="button secondary" href={demo ? '#/tv-wall?dados=exemplo' : '#/tv-wall'}>
            Abrir TV Wall
            <ArrowSquareOut size={18} aria-hidden="true" />
          </a>
        </nav>
      ) : (
        <header className="wall-header">
          <Brand className="wall-brand" />
          <nav className="wall-actions" aria-label="Ações do TV Wall">
            <a
              className="button secondary"
              href={demo ? '#/demonstracao' : '#/painel?dados=servidor'}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Voltar ao painel
            </a>
            <button className="button secondary" onClick={() => void toggleFullscreen()}>
              {fullscreen ? (
                <ArrowsIn size={18} aria-hidden="true" />
              ) : (
                <ArrowsOut size={18} aria-hidden="true" />
              )}
              {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            </button>
          </nav>
        </header>
      )}
      <section className="wall-title" aria-labelledby="wall-title">
        <div>
          <h1 id="wall-title">Experiência do paciente</h1>
          <p>TV Wall · pesquisas enviadas nos últimos 30 dias</p>
        </div>
        <p className="wall-period">
          {summary
            ? `${date(summary.period.from)} a ${date(summary.period.to)}`
            : 'Carregando período…'}
        </p>
      </section>
      {demo && (
        <p className="wall-demo">
          Demonstração com dados fictícios. Estes indicadores não representam resultados do
          hospital.
        </p>
      )}
      <div className="wall-status" role="status">
        {loading
          ? 'Carregando indicadores…'
          : error
            ? `${summary ? 'Dados sem atualização. ' : 'Indicadores indisponíveis. '}${error}`
            : summary
              ? `${demo ? 'Exemplo gerado' : 'Atualizado'} às ${new Date(summary.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · atualização a cada 15 segundos`
              : ''}
      </div>
      {fullscreenError && (
        <p className="wall-error" role="alert">
          {fullscreenError}
        </p>
      )}
      <dl className="wall-metrics" aria-label="Indicadores gerais">
        <div>
          <dt>Pesquisas recebidas</dt>
          <dd>
            <span className="wall-metric-value">{number(summary?.total)}</span>
            <p>Pesquisas enviadas no período</p>
          </dd>
        </div>
        <div>
          <dt>NPS do hospital</dt>
          <dd>
            <span className="wall-metric-value">{number(summary?.nps)}</span>
            <p>De −100 a +100 · promotores menos detratores</p>
          </dd>
        </div>
        <div>
          <dt>Satisfação</dt>
          <dd>
            <span className="wall-metric-value">
              {summary?.satisfaction == null ? '—' : `${number(summary.satisfaction)}%`}
            </span>
            <p>Proporção de notas 4 e 5 entre as avaliações recebidas</p>
          </dd>
        </div>
      </dl>
      <section className="wall-sectors" aria-labelledby="wall-sectors-title">
        <div className="wall-section-heading">
          <h2 id="wall-sectors-title">Avaliações por setor</h2>
          <p>Média das notas recebidas · escala de 1 a 5</p>
        </div>
        <div className="wall-sector-grid">
          {SECTORS.map((sector) => {
            const result = summary?.sectors.find((item) => item.id === sector.id);
            const visible = result?.average != null && result.responses != null;
            return (
              <article className="wall-sector" key={sector.id}>
                <h3>{sector.name}</h3>
                <p className="wall-sector-score">
                  {visible
                    ? result.average!.toLocaleString('pt-BR', { minimumFractionDigits: 1 })
                    : '—'}
                  <span>{visible ? '/ 5' : ''}</span>
                </p>
                <div className="wall-sector-bar" aria-hidden="true">
                  {visible && <span style={{ width: `${(result.average! / 5) * 100}%` }} />}
                </div>
                <p className="wall-sector-count">
                  {loading
                    ? 'Carregando…'
                    : !summary
                      ? 'Aguardando conexão'
                      : visible
                        ? `${number(result.responses)} pesquisas com notas neste setor`
                        : `Exibição a partir de ${minimum} pesquisas com notas`}
                </p>
              </article>
            );
          })}
        </div>
      </section>
      <footer className="wall-footer">
        <div>
          <p>
            Grupos com menos de {minimum} pesquisas ficam ocultos. NPS: percentual de notas 9–10
            menos o de notas 0–6, entre as respostas válidas de NPS.
          </p>
          <p>
            Projeto acadêmico · indicadores agregados, sem informações pessoais ou relatos
            individuais.
          </p>
        </div>
        <a className="button primary" href="#/pesquisa">
          <ClipboardText size={20} aria-hidden="true" />
          Responder à pesquisa
        </a>
      </footer>
    </Container>
  );
}
