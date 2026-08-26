import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
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
  // Fase 5: el socket del dashboard del cliente (realtime.tsx) también
  // necesita refrescar el access token cuando el handshake falla por
  // token vencido (dura 15 min) -- comparte esta misma lógica en vez de
  // duplicarla.
  refreshAccessToken: () => Promise<string>;
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

  const login = useCallback(async (email: string, password: string): Promise<Session> => {
    const next = await api.login(email, password);
    await saveSession(next);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (session) {
      await api.logoutRequest(session.accessToken, session.refreshToken);
    }
    await clearSession();
    setSession(null);
  }, [session]);

  // Extraído de authFetch para que el socket (realtime.tsx) pueda
  // refrescar el access token sin pasar por un fetch HTTP: el handshake
  // de socket.io no tiene un "401" que interceptar, así que llama esto
  // directo desde su handler de connect_error. useCallback (dependiente
  // solo de `session`) le da identidad estable entre renders -- si no,
  // el useEffect de realtime.tsx que la usa como dependencia se
  // reengancharía en cada render de este provider.
  const refreshAccessToken = useCallback(async (): Promise<string> => {
    if (!session) throw new Error('No hay sesión activa');
    const refreshed = await api.refreshSession(session.refreshToken);
    const next: Session = { ...session, ...refreshed };
    await saveSession(next);
    setSession(next);
    return refreshed.accessToken;
  }, [session]);

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      if (!session) throw new Error('No hay sesión activa');

      const withAuth = (token: string): RequestInit => ({
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });

      const res = await fetch(`${API_BASE_URL}${path}`, withAuth(session.accessToken));
      if (res.status !== 401) return res;

      try {
        const accessToken = await refreshAccessToken();
        return await fetch(`${API_BASE_URL}${path}`, withAuth(accessToken));
      } catch {
        await clearSession();
        setSession(null);
        return res;
      }
    },
    [session, refreshAccessToken],
  );

  const value: AuthContextValue = useMemo(
    () => ({ session, isLoading, login, logout, authFetch, refreshAccessToken }),
    [session, isLoading, login, logout, authFetch, refreshAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
