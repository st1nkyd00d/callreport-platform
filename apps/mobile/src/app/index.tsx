import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth-context';
import { homeRouteForRole } from '@/lib/session';

// Gate de arranque: espera a que AuthProvider termine de leer la sesión
// de expo-secure-store (isLoading) antes de decidir a dónde redirigir --
// así matar y reabrir la app mantiene la sesión (criterio de aceptación
// de Fase 2) en vez de mandar siempre a /login primero.
export default function Index() {
  const router = useRouter();
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(session ? homeRouteForRole(session.user.role) : '/login');
  }, [isLoading, session, router]);

  return null;
}
