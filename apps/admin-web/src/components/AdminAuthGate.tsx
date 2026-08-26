import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../api/auth-context';

// Envuelve las rutas /admin/* reales (Fase 3) -- redirige a /admin/login
// si no hay sesión real todavía. No afecta a /mobile/* (prototipos de
// diseño, siguen con el mock store de AppStore).
export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAdminAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
