import { useRef, useState, type FormEvent } from 'react';
import Brand from './Brand';
import { useAuth } from './Auth';

export default function PasswordChange() {
  const { user, loading, changePassword, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const errorNode = useRef<HTMLParagraphElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (password !== confirmation) {
      setError('As duas senhas novas precisam ser iguais.');
      requestAnimationFrame(() => errorNode.current?.focus());
      return;
    }
    pending.current = true;
    setError('');
    try {
      await changePassword(current, password);
      setCurrent('');
      setPassword('');
      setConfirmation('');
      location.hash = '/painel?dados=servidor';
    } catch (cause) {
      setError((cause as Error).message);
      requestAnimationFrame(() => errorNode.current?.focus());
    } finally {
      pending.current = false;
    }
  }
  return (
    <main className="access-page password-page">
      <Brand className="auth-brand" />
      <section className="auth-panel password-panel" aria-labelledby="password-heading">
        <h1 id="password-heading">Defina sua senha</h1>
        <p>
          Seu primeiro acesso usa uma senha temporária. Escolha uma senha pessoal para abrir o
          painel.
        </p>
        <p className="small muted">
          Conta: {user?.email}. O administrador não poderá consultar sua nova senha.
        </p>
        <form className="auth-form" onSubmit={submit} aria-busy={loading}>
          <label>
            Senha temporária
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              aria-describedby="new-password-help"
            />
          </label>
          <p id="new-password-help" className="small muted">
            Pelo menos 12 caracteres. Use uma senha diferente da temporária.
          </p>
          <label>
            Confirmar nova senha
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={loading}
            />
          </label>
          {error && (
            <p className="error-message" role="alert" ref={errorNode} tabIndex={-1}>
              {error}
            </p>
          )}
          <button className="button primary" disabled={loading}>
            {loading ? 'Salvando senha…' : 'Salvar minha senha'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={loading}
            onClick={async () => {
              try {
                await signOut();
                location.hash = '/login';
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            Sair desta conta
          </button>
        </form>
      </section>
      <p className="academic-disclaimer">
        Protótipo acadêmico · sem integração com os sistemas da FHDOD.
      </p>
    </main>
  );
}
