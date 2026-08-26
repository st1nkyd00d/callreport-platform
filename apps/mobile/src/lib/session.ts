import * as SecureStore from 'expo-secure-store';

// Duplicado a propósito de packages/shared (Role/User) -- mismo criterio
// que apps/api/prisma/seed.ts con DEFAULT_DISPOSITIONS: esta app todavía
// no tiene wireado el import cross-workspace de @callreport/shared
// (Metro necesita config adicional para paquetes del monorepo sin build
// propio) y no vale la pena arriesgar el bundler ya verificado
// funcionando (ver PROGRESS.md Fase 1) por un solo tipo compartido.
export type Role = 'super_admin' | 'supervisor' | 'agent' | 'client_user';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tenantId?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const SESSION_KEY = 'callreport.session';

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

// Solo agente y cliente tienen pantalla propia en el móvil (plan.md
// Fase 2). Staff (supervisor/super_admin) administra desde admin-web
// (Fase 3) -- cae en (agent)/nuevo-reporte como fallback inofensivo en
// vez de romper si alguien de staff prueba loguearse acá.
export function homeRouteForRole(
  role: Role,
): '/(client)/dashboard' | '/(agent)/nuevo-reporte' {
  return role === 'client_user' ? '/(client)/dashboard' : '/(agent)/nuevo-reporte';
}
