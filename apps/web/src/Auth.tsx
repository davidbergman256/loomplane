import { createContext, useContext, useEffect, useState } from 'react';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import type { ReactNode, FormEvent } from 'react';
import { Brand } from './components';
import { clearSessionToken, setSessionToken, sessionToken } from './api';
interface AuthInfo {
  required: boolean;
  authenticated: boolean;
  role: 'local' | 'reader' | 'writer' | 'admin' | null;
  projectId?: string | null;
}
interface AuthContext extends AuthInfo {
  canWrite: boolean;
  canAdmin: boolean;
  logout: () => void;
}
const Auth = createContext<AuthContext>({
  required: false,
  authenticated: true,
  role: 'local',
  canWrite: true,
  canAdmin: true,
  logout: () => {},
});
export function useAuth() {
  return useContext(Auth);
}
async function inspectAuth(token?: string): Promise<AuthInfo> {
  const response = await fetch('/api/auth', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'This credential is invalid or has been revoked.'
        : 'Unable to connect to the context server.',
    );
  return response.json();
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    inspectAuth(sessionToken() || undefined)
      .then((value) => {
        if (active) {
          setInfo(value);
          setError('');
        }
      })
      .catch(async (cause) => {
        clearSessionToken();
        try {
          const publicInfo = await inspectAuth();
          if (active) {
            setInfo(publicInfo);
            setError(cause.message);
          }
        } catch {
          if (active)
            setError('The context server is unavailable. Check that it is running and retry.');
        }
      });
    return () => {
      active = false;
    };
  }, [retry]);
  function logout() {
    clearSessionToken();
    setToken('');
    setError('');
    setInfo((current) => (current ? { ...current, authenticated: false, role: null } : null));
  }
  useEffect(() => {
    const listener = () => {
      clearSessionToken();
      setToken('');
      setInfo((current) => (current ? { ...current, authenticated: false, role: null } : null));
      setError('Your credential expired or was revoked. Sign in with an active credential.');
    };
    window.addEventListener('loomplane:unauthorized', listener);
    return () => window.removeEventListener('loomplane:unauthorized', listener);
  }, []);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cleaned = token.trim();
      const value = await inspectAuth(cleaned);
      if (!value.authenticated) throw new Error('Enter an active server credential.');
      setSessionToken(cleaned);
      setToken('');
      setInfo(value);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!info || (info.required && !info.authenticated))
    return (
      <div className="auth-screen">
        <div className="auth-brand">
          <Brand />
          <span>Shared context, intentional access.</span>
        </div>
        <div className="auth-card">
          <div className="auth-symbol">
            <KeyRound size={23} />
          </div>
          <h1>
            {info
              ? 'Open your workspace.'
              : error
                ? 'Reconnect to your workspace.'
                : 'Connecting to Loomplane…'}
          </h1>
          <p>
            {info
              ? 'This server requires an API credential. Use a reader or writer credential from your workspace administrator.'
              : 'Checking the local context server.'}
          </p>
          {info && (
            <form onSubmit={signIn}>
              <label>
                Server credential
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your credential"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <button className="button primary" disabled={busy || !token.trim()}>
                {busy ? 'Signing in…' : 'Open workspace'}
                <ArrowRight size={15} />
              </button>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!info && error && (
            <button
              className="button secondary"
              onClick={() => {
                setError('');
                setRetry((t) => t + 1);
              }}
            >
              Retry connection
            </button>
          )}
          <div className="auth-privacy">
            <ShieldCheck size={15} />
            <span>
              Stored for this browser session only.
              <br />
              Credentials never appear in a link.
            </span>
          </div>
        </div>
        <p className="auth-footnote">
          A server credential grants access. It is not a verified personal identity.
        </p>
      </div>
    );
  return (
    <Auth.Provider
      value={{
        ...info,
        canWrite: info.role !== 'reader',
        canAdmin: info.role === 'local' || info.role === 'admin',
        logout,
      }}
    >
      {children}
    </Auth.Provider>
  );
}
