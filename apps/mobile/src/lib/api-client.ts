import { API_BASE_URL } from './api-config';
import type { Session } from './session';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function parseErrorMessage(res: Response): Promise<string> {
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
    // Best-effort: la sesión local se borra igual aunque esta llamada
    // falle (sin conexión, servidor caído, etc.).
  }
}
