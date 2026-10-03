import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ShieldCheck, Users, CheckCircle } from '@phosphor-icons/react';
import { useAuth } from './Auth';
import { createUser, getUsers, type User, type UserRole } from './api';
import { SECTORS, sectorName, type SectorId } from './domain';

export default function UsersPage() {
  const { user, csrfToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('sector-admin');
  const [sectorId, setSectorId] = useState<SectorId>('recepcao');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const errorNode = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let active = true;
    setUsers([]);
    setError('');
    if (user?.role !== 'manager') return;
    setLoading(true);
    getUsers()
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, reload]);
  useEffect(() => {
    if (error) errorNode.current?.focus();
  }, [error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const added = await createUser(
        {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          sectorId: role === 'manager' ? null : sectorId,
        },
        csrfToken ?? '',
      );
      setUsers((previous) => [...previous, added]);
      setName('');
      setEmail('');
      setPassword('');
      setStatus(
        `Acesso de ${added.name} criado. Entregue a senha diretamente à pessoa responsável.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  if (user?.role !== 'manager')
    return (
      <div className="empty-state">
        <ShieldCheck size={40} aria-hidden="true" />
        <h1>Acessos são administrados pela gestão.</h1>
        <p>Esta área é exclusiva para contas de gestor.</p>
        <a className="button primary" href={user ? '#/painel?dados=servidor' : '#/login'}>
          {user ? 'Voltar ao painel' : 'Entrar na gestão'}
        </a>
      </div>
    );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Acessos da equipe</h1>
          <p>Defina quem acompanha todos os setores e quem cuida de um setor.</p>
        </div>
        <Users size={30} aria-hidden="true" />
      </div>
      <div className="users-layout">
        <section className="panel user-list" aria-labelledby="users-heading">
          <div className="panel-heading">
            <h2 id="users-heading">Contas cadastradas</h2>
            <button
              className="text-button"
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              Atualizar lista
            </button>
          </div>
          {loading && (
            <p className="muted" role="status">
              Carregando contas…
            </p>
          )}
          {users.map((account) => (
            <article className="user-row" key={account.id}>
              <span className="user-avatar" aria-hidden="true">
                {account.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h3>{account.name}</h3>
                <p>{account.email}</p>
                <span className="badge">
                  {account.role === 'manager'
                    ? 'Administrador · acesso total'
                    : `Gestor · ${sectorName(account.sectorId ?? '')}`}
                </span>
              </div>
            </article>
          ))}
        </section>
        <section className="panel new-user" aria-labelledby="create-heading">
          <h2 id="create-heading">Criar acesso</h2>
          <p className="muted small">Cada pessoa deve usar sua própria conta.</p>
          <form className="auth-form" onSubmit={submit} aria-busy={saving}>
            <label htmlFor="user-name">
              Nome
              <input
                id="user-name"
                name="name"
                autoComplete="off"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </label>
            <label htmlFor="user-email">
              E-mail
              <input
                id="user-email"
                name="email"
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
              />
            </label>
            <label htmlFor="user-password">
              Senha temporária
              <input
                id="user-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                aria-describedby="password-help"
              />
            </label>
            <p className="small muted" id="password-help">
              Use pelo menos 12 caracteres. No primeiro acesso, a pessoa deverá escolher uma senha
              pessoal.
            </p>
            <label htmlFor="user-role">
              Perfil
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={saving}
              >
                <option value="sector-admin">Gestor de setor</option>
                <option value="manager">Administrador com acesso total</option>
              </select>
            </label>
            {role === 'sector-admin' && (
              <label htmlFor="user-sector">
                Setor permitido
                <select
                  id="user-sector"
                  value={sectorId}
                  onChange={(e) => setSectorId(e.target.value as SectorId)}
                  disabled={saving}
                >
                  {SECTORS.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && (
              <p ref={errorNode} tabIndex={-1} className="error-message" role="alert">
                {error}
              </p>
            )}
            {status && (
              <p className="status-message" role="status">
                <CheckCircle size={20} aria-hidden="true" />
                {status}
              </p>
            )}
            <button className="button primary" disabled={saving}>
              {saving ? 'Criando acesso…' : 'Criar acesso'}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
