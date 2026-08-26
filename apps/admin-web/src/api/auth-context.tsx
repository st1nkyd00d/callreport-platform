import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import * as api from './client';
import { API_BASE_URL } from './config';
import { clearSession, loadSession, saveSession, type Session } from './session';

interface AdminAuthContextValue {
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  // Fetch autenticado: reintenta UNA vez con un access token fresco si la
  // respuesta es 401 (expira a los 15 min -- ver AuthService en apps/api).
  // Mismo patrón que apps/mobile/src/lib/auth-context.tsx#authFetch.
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSession(loadSession());
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string): Promise<Session> {
    const next = await api.login(email, password);
    saveSession(next);
    setSession(next);
    return next;
  }

  async function logout(): Promise<void> {
    if (session) {
      await api.logoutRequest(session.accessToken, session.refreshToken);
    }
    clearSession();
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
      saveSession(next);
      setSession(next);
      return await fetch(`${API_BASE_URL}${path}`, withAuth(refreshed.accessToken));
    } catch {
      clearSession();
      setSession(null);
      return res;
    }
  }

  const value: AdminAuthContextValue = { session, isLoading, login, logout, authFetch };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de <AdminAuthProvider>');
  return ctx;
}
