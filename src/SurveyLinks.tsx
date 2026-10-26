import { useEffect, useMemo, useState } from 'react';
import { ArrowSquareOut, Copy, DownloadSimple, Info } from '@phosphor-icons/react';
import { SECTORS, sectorName } from './domain';
import './survey-links.css';

export default function SurveyLinks() {
  const [status, setStatus] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [qrError, setQrError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const links = useMemo(
    () =>
      Object.fromEntries(
        SECTORS.map((sector) => {
          const url = new URL(import.meta.env.BASE_URL, window.location.href);
          url.search = '';
          url.hash = `/pesquisa/${sector.id}`;
          return [sector.id, url.href];
        }),
      ),
    [],
  );

  useEffect(() => {
    let active = true;
    setQrError(false);
    async function generate() {
      try {
        const { toDataURL } = await import('qrcode');
        const generated = await Promise.all(
          SECTORS.map(async (sector) => [
            sector.id,
            await toDataURL(links[sector.id], {
              width: 512,
              margin: 4,
              errorCorrectionLevel: 'M',
              color: { dark: '#322a2d', light: '#ffffff' },
            }),
          ]),
        );
        if (active) setCodes(Object.fromEntries(generated));
      } catch {
        if (active) setQrError(true);
      }
    }
    void generate();
    return () => {
      active = false;
    };
  }, [links, attempt]);

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(links[id]);
      setStatus(`Link de ${sectorName(id)} copiado.`);
    } catch {
      setStatus(
        'Não foi possível copiar automaticamente. Selecione o endereço do setor e copie manualmente.',
      );
    }
  }

  return (
    <div className="survey-links-page">
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
          Os links e QR Codes abrem as pesquisas deste site. Para usar em celulares e tablets, o
          endereço precisa estar acessível nesses dispositivos. Baixe os QR Codes após abrir a
          versão publicada.
        </p>
      </div>
      <p role="status" className={status ? 'status-message' : 'sr-only'}>
        {status}
      </p>
      {qrError && (
        <div className="qr-error">
          <p className="error-message" role="alert">
            Não foi possível gerar os QR Codes. Os links continuam disponíveis.
          </p>
          <button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>
            Tentar gerar novamente
          </button>
        </div>
      )}
      <div className="sector-link-list">
        {SECTORS.map((sector, index) => (
          <article key={sector.id} aria-labelledby={`sector-link-${sector.id}`}>
            <span className="sector-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="sector-link-info">
              <h2 id={`sector-link-${sector.id}`}>{sector.name}</h2>
              <p>{sector.description} · perguntas específicas, gerais e NPS</p>
              <label className="sr-only" htmlFor={`url-${sector.id}`}>
                URL de {sector.name}
              </label>
              <input
                id={`url-${sector.id}`}
                readOnly
                value={links[sector.id]}
                onFocus={(event) => event.target.select()}
              />
              <div className="link-actions">
                <button className="button secondary" onClick={() => copy(sector.id)}>
                  <Copy size={18} aria-hidden="true" />
                  Copiar link
                </button>
                <a className="button primary" href={`#/pesquisa/${sector.id}`}>
                  Abrir pesquisa
                  <ArrowSquareOut size={18} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="sector-qr">
              {codes[sector.id] ? (
                <>
                  <img
                    src={codes[sector.id]}
                    width={144}
                    height={144}
                    alt={`QR Code para responder à pesquisa de ${sector.name}. O endereço também está disponível neste setor.`}
                  />
                  <a
                    className="button secondary qr-download"
                    href={codes[sector.id]}
                    download={`pesquisa-fhdod-${sector.id}.png`}
                    aria-label={`Baixar QR Code de ${sector.name} em PNG`}
                  >
                    <DownloadSimple size={18} aria-hidden="true" />
                    Baixar QR
                  </a>
                </>
              ) : (
                <div className="qr-placeholder">
                  {qrError ? 'QR Code indisponível' : 'Gerando QR Code…'}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="next-stage">
        <h2>Do atendimento ao convite</h2>
        <p>
          Disponibilize o QR Code ou o link do setor para todas as pessoas atendidas, acolhendo
          elogios, sugestões e reclamações. O envio automático após o atendimento ainda depende de
          uma integração e de um canal autorizado. Nenhuma mensagem é enviada por esta versão.
        </p>
      </div>
    </div>
  );
}
