import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import * as api from './api-client';
import { API_BASE_URL } from './api-config';
import { clearSession, loadSession, saveSession, type Session } from './session';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  // Fetch autenticado para las fases siguientes (Fase 4 en adelante):
  // reintenta UNA vez con un access token fresco si la respuesta es 401
  // (expira a los 15 min -- ver AuthService). Si el refresh también
  // falla (refresh token vencido/revocado), cierra la sesión local para
  // forzar un login nuevo.
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<Session> {
    const next = await api.login(email, password);
    await saveSession(next);
    setSession(next);
    return next;
  }

  async function logout(): Promise<void> {
    if (session) {
      await api.logoutRequest(session.accessToken, session.refreshToken);
    }
    await clearSession();
    setSession(null);
  }

  async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (!session) throw new Error('No hay sesión activa');

    const withAuth = (token: string): RequestInit => ({
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });

    const res = await fetch(`${API_BASE_URL}${path}`, withAuth(session.accessToken));
    if (res.status !== 401) return res;

    try {
      const refreshed = await api.refreshSession(session.refreshToken);
      const next: Session = { ...session, ...refreshed };
      await saveSession(next);
      setSession(next);
      return await fetch(`${API_BASE_URL}${path}`, withAuth(refreshed.accessToken));
    } catch {
      await clearSession();
      setSession(null);
      return res;
    }
  }

  const value: AuthContextValue = { session, isLoading, login, logout, authFetch };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
