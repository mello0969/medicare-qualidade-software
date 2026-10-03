import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ArrowRight, ShieldCheck } from '@phosphor-icons/react';
import * as api from './api';
import type { Session, User } from './api';
import Brand from './Brand';

type AuthContextValue = {
  user: User | null;
  csrfToken: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const anonymous: Session = { user: null, csrfToken: null };
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Não foi possível concluir a solicitação. Tente novamente.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(anonymous);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const operation = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const nextSession = await api.getSession();
      if (operation === generation.current) setSession(nextSession);
    } catch (cause) {
      if (operation === generation.current) {
        setSession(anonymous);
        setError(message(cause));
      }
    } finally {
      if (operation === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const operation = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const nextSession = await api.login(email, password);
      if (!nextSession.user || !nextSession.csrfToken)
        throw new api.ApiError('Não foi possível confirmar sua sessão. Tente novamente.', 502);
      if (operation === generation.current) setSession(nextSession);
      return nextSession.user;
    } catch (cause) {
      if (operation === generation.current) setError(message(cause));
      throw cause;
    } finally {
      if (operation === generation.current) setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const operation = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      if (session.csrfToken) {
        try {
          await api.logout(session.csrfToken);
        } catch (cause) {
          if (!(cause instanceof api.ApiError && cause.status === 401)) throw cause;
        }
      }
      if (operation === generation.current) setSession(anonymous);
    } catch (cause) {
      if (operation === generation.current) setError(message(cause));
      throw cause;
    } finally {
      if (operation === generation.current) setLoading(false);
    }
  }, [session.csrfToken]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const operation = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const next = await api.changePassword(
          currentPassword,
          newPassword,
          session.csrfToken ?? '',
        );
        if (operation === generation.current) setSession(next);
      } catch (cause) {
        if (operation === generation.current) setError(message(cause));
        throw cause;
      } finally {
        if (operation === generation.current) setLoading(false);
      }
    },
    [session.csrfToken],
  );

  return (
    <AuthContext.Provider
      value={{ ...session, loading, error, signIn, signOut, refresh, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}

export default function Login() {
  const { user, loading, error, signIn, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const submitError = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (user && !loading)
      location.hash = user.mustChangePassword ? '/trocar-senha' : '/painel?dados=servidor';
  }, [user, loading]);

  useEffect(() => {
    if (formError) submitError.current?.focus();
  }, [formError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || loading) return;
    pending.current = true;
    setSubmitting(true);
    setFormError('');
    try {
      const signedUser = await signIn(email.trim(), password);
      setPassword('');
      location.hash = signedUser.mustChangePassword ? '/trocar-senha' : '/painel?dados=servidor';
    } catch (cause) {
      setFormError(
        cause instanceof api.ApiError && cause.status === 401
          ? 'Não foi possível entrar. Confira o e-mail e a senha e tente novamente.'
          : message(cause),
      );
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <Brand className="auth-brand" />
        <div>
          <h1>Entre para acompanhar o cuidado.</h1>
          <p>
            Pesquisa de satisfação para o Hospital Dr. Oswaldo Diesel, em Três Coroas. Sua
            experiência orienta este projeto.
          </p>
        </div>
        <a className="text-button" href="#/pesquisa">
          Responder à pesquisa sem conta
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
      <section className="auth-panel" aria-labelledby="login-title">
        <ShieldCheck size={32} aria-hidden="true" />
        <h2 id="login-title">Acesso à gestão</h2>
        <p>Use a conta fornecida pelo responsável pelo projeto.</p>
        <form className="auth-form" onSubmit={submit} aria-busy={loading || submitting}>
          <label htmlFor="login-email">
            E-mail
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
              disabled={submitting}
            />
          </label>
          <label htmlFor="login-password">
            Senha
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
              required
              disabled={submitting}
            />
          </label>
          {formError ? (
            <p ref={submitError} className="error-message" role="alert" tabIndex={-1}>
              {formError}
            </p>
          ) : error ? (
            <div>
              <p className="error-message" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                Verificar conexão novamente
              </button>
            </div>
          ) : null}
          <button className="button primary" type="submit" disabled={loading || submitting}>
            {submitting ? 'Entrando…' : loading ? 'Verificando acesso…' : 'Entrar'}
            {!loading && !submitting && <ArrowRight size={18} aria-hidden="true" />}
          </button>
          {loading && !submitting && (
            <p className="muted" role="status">
              Verificando sua sessão.
            </p>
          )}
        </form>
        <a className="auth-back text-button" href="#/demonstracao">
          Explorar o painel de exemplo
        </a>
      </section>
    </div>
  );
}
