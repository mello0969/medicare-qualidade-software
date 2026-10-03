import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from './Auth';
import { ApiError, getContacts, getSettings, updateContactStatus, updateSettings } from './api';
import { sectorName, type ContactRequest, type ContactStatus, type SurveySettings } from './domain';

const statusNames: Record<ContactStatus, string> = {
  novo: 'Novo',
  'em-analise': 'Em análise',
  concluido: 'Concluído',
};
function Restricted() {
  return (
    <div className="empty-state">
      <h1>Área exclusiva do administrador</h1>
      <p>
        Pedidos de contato e mensagens da pesquisa são administrados pelo perfil com acesso total.
      </p>
      <a href="#/" className="button primary">
        Voltar ao início
      </a>
    </div>
  );
}

export function OmbudsmanPage() {
  const { user, csrfToken, refresh } = useAuth();
  const [contacts, setContacts] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setContacts([]);
    setError('');
    if (user?.role !== 'manager') return;
    setLoading(true);
    getContacts()
      .then((data) => {
        if (active) setContacts(data);
      })
      .catch((cause) => {
        if (active) {
          setError(cause.message);
          if (cause instanceof ApiError && cause.status === 401) void refresh();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, reload, refresh]);
  if (user?.role !== 'manager') return <Restricted />;
  async function changeStatus(contact: ContactRequest, status: ContactStatus) {
    if (saving) return;
    setSaving(contact.id);
    setError('');
    setNotice('');
    try {
      const result = await updateContactStatus(contact.id, status, csrfToken ?? '');
      setContacts((previous) =>
        previous.map((item) => (item.id === contact.id ? result.contact : item)),
      );
      setNotice('Situação da manifestação atualizada.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving('');
    }
  }
  const filtered = contacts.filter((contact) => !filter || contact.status === filter);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ouvidoria</h1>
          <p>Pedidos de contato autorizados após avaliações de atendimento com nota 1 ou 2.</p>
        </div>
        <button
          className="button secondary"
          disabled={loading || !!saving}
          onClick={() => setReload((n) => n + 1)}
        >
          Atualizar manifestações
        </button>
      </div>
      <div className="notice">
        <p>
          Este ambiente acadêmico registra pedidos para demonstração. Nenhuma mensagem é enviada ao
          hospital. Dados de contato ficam separados dos indicadores e da exportação Excel.
        </p>
      </div>
      <div className="contact-summary" aria-label="Resumo da ouvidoria">
        {(Object.keys(statusNames) as ContactStatus[]).map((status) => (
          <div key={status}>
            <strong>{contacts.filter((contact) => contact.status === status).length}</strong>
            <span>{statusNames[status]}</span>
          </div>
        ))}
      </div>
      <label className="contact-filter">
        Situação
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todas as situações</option>
          {(Object.keys(statusNames) as ContactStatus[]).map((status) => (
            <option value={status} key={status}>
              {statusNames[status]}
            </option>
          ))}
        </select>
      </label>
      {loading && <p role="status">Carregando manifestações…</p>}
      {error && (
        <p className="error-message" role="alert">
          {error} Use “Atualizar manifestações” para tentar novamente.
        </p>
      )}
      {notice && (
        <p className="status-message" role="status">
          {notice}
        </p>
      )}
      {!loading && !error && !filtered.length && (
        <div className="empty-state">
          <h2>Nenhuma manifestação neste recorte</h2>
          <p>
            Um pedido aparecerá quando a pessoa solicitar contato e autorizar o uso dos seus dados.
          </p>
        </div>
      )}
      <div className="contact-list">
        {filtered.map((contact) => (
          <article className="panel contact-record" key={contact.id}>
            <header>
              <div>
                <h2>{contact.name}</h2>
                <p className="muted small">
                  {contact.sectorIds.map(sectorName).join(' · ')} ·{' '}
                  <time dateTime={contact.createdAt}>
                    {new Date(contact.createdAt).toLocaleString('pt-BR')}
                  </time>
                </p>
              </div>
              <span className="badge">{statusNames[contact.status]}</span>
            </header>
            <p className="contact-message">{contact.message}</p>
            <dl>
              <div>
                <dt>Telefone</dt>
                <dd>{contact.phone}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{contact.email || 'Não informado'}</dd>
              </div>
            </dl>
            <details>
              <summary>Autorização registrada</summary>
              <p>{contact.consentText}</p>
              <p className="muted small">
                Versão {contact.settingsVersion} das mensagens da pesquisa. A autorização foi
                confirmada no envio.
              </p>
            </details>
            <label>
              Situação desta manifestação
              <select
                aria-label={`Situação de ${contact.name}`}
                value={contact.status}
                disabled={!!saving}
                onChange={(e) => void changeStatus(contact, e.target.value as ContactStatus)}
              >
                {(Object.keys(statusNames) as ContactStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {statusNames[status]}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
    </>
  );
}

const messageFields = [
  ['contactPrompt', 'Mensagem de convite'],
  ['contactConsent', 'Texto de autorização'],
  ['confirmationText', 'Confirmação de envio'],
  ['successText', 'Mensagem após envio'],
] as const;
export function SettingsPage() {
  const { user, csrfToken } = useAuth();
  const [original, setOriginal] = useState<SurveySettings | null>(null);
  const [draft, setDraft] = useState<SurveySettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    setOriginal(null);
    setDraft(null);
    setError('');
    if (user?.role !== 'manager') return;
    setLoading(true);
    getSettings()
      .then((data) => {
        if (active) {
          setOriginal(data);
          setDraft(data);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, reload]);
  if (user?.role !== 'manager') return <Restricted />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !original || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await updateSettings(draft, original.version, csrfToken ?? '');
      setOriginal(updated);
      setDraft(updated);
      setNotice('Mensagens atualizadas. Novas pesquisas usarão esta versão.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Mensagens da pesquisa</h1>
          <p>Defina os textos de convite, autorização e confirmação exibidos ao paciente.</p>
        </div>
        {original && <span className="badge">Versão {original.version}</span>}
      </div>
      <div className="notice">
        <p>
          O e-mail é uma configuração de referência da ouvidoria. O protótipo não envia e-mails nem
          mensagens. As autorizações anteriores preservam o texto que a pessoa confirmou.
        </p>
      </div>
      {loading && <p role="status">Carregando mensagens…</p>}
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
      <form className="editor settings-form" onSubmit={save} aria-busy={loading || saving}>
        {draft && (
          <>
            {messageFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  required
                  minLength={8}
                  maxLength={400}
                  rows={3}
                  value={draft[key]}
                  disabled={saving}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              E-mail da ouvidoria
              <input
                type="email"
                required
                maxLength={254}
                value={draft.ombudsmanEmail}
                disabled={saving}
                onChange={(e) => setDraft({ ...draft, ombudsmanEmail: e.target.value })}
              />
            </label>
          </>
        )}
        <div className="editor-button-group">
          <button
            className="button secondary"
            type="button"
            disabled={saving || loading}
            onClick={() => {
              setNotice('');
              setReload((n) => n + 1);
            }}
          >
            {dirty ? 'Descartar e recarregar' : 'Recarregar mensagens'}
          </button>
          <button className="button primary" disabled={!draft || !dirty || saving || loading}>
            {saving ? 'Salvando…' : 'Salvar mensagens'}
          </button>
        </div>
      </form>
    </>
  );
}
