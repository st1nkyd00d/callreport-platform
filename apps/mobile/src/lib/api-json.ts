import { ApiError, parseErrorMessage } from './api-client';

// Mismo patrón que apps/admin-web/src/api/client.ts (authJson/
// parseJsonResponse), sobre el authFetch de auth-context.tsx -- que ya
// reintenta una vez tras un 401 refrescando el access token.
export type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

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
