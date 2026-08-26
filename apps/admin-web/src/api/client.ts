import { API_BASE_URL } from './config';
import type { Session } from './session';

// Mismo patrón que apps/mobile/src/lib/api-client.ts (login/refresh/logout
// planos, sin auth todavía -- el fetch autenticado vive en auth-context.tsx).
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // Sin body JSON parseable -- se cae al mensaje genérico de abajo.
  }
  return 'Ocurrió un error inesperado. Intentá de nuevo.';
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status);
  return (await res.json()) as Session;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export async function refreshSession(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status);
  return (await res.json()) as RefreshResult;
}

export async function logoutRequest(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Best-effort: la sesión local se borra igual aunque esta llamada falle.
  }
}

// Helper genérico para las llamadas JSON autenticadas de los hooks de
// api/tenants.ts, api/users.ts, api/campaigns.ts -- lanza ApiError con el
// mensaje del backend si la respuesta no es 2xx.
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function authJson<T>(
  authFetch: AuthFetch,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await authFetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseJsonResponse<T>(res);
}
