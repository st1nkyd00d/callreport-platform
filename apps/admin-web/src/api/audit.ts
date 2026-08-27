import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { authJson } from './client';
import { useAdminAuth } from './auth-context';

// Fase 7 (plan.md): visor de auditoría real -- RLS (audit_logs_staff_
// select, plan-fase-7.md D4) es el corte real de quién puede leer; estos
// hooks solo consumen /admin/audit-logs. Forma distinta a AuditLog de
// @callreport/shared (esa era la del mock: userEmail plano) -- el
// endpoint real incluye la relación `user` completa, así que se define
// un tipo propio en vez de forzar el shape del mock.
export interface AdminAuditLog {
  id: string;
  userId: string;
  user: { fullName: string; email: string };
  action: string;
  entityType: string;
  entityId: string;
  diff: { field: string; before: unknown; after: unknown }[] | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogsPage {
  items: AdminAuditLog[];
  nextCursor: string | null;
}

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditFilterOptions {
  actions: string[];
  entityTypes: string[];
}

function buildQuery(filters: AuditLogFilters, after?: string): string {
  const params = new URLSearchParams();
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (after) params.set('after', after);
  params.set('limit', '25');
  return `?${params.toString()}`;
}

export function useAuditLogs(filters: AuditLogFilters) {
  const { authFetch } = useAdminAuth();
  return useInfiniteQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      authJson<AuditLogsPage>(authFetch, 'GET', `/admin/audit-logs${buildQuery(filters, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// Alimenta los <select> de Acción/Entidad con valores REALMENTE presentes
// en la tabla -- AuditAction de @callreport/shared incluye acciones que
// el backend nunca escribe (suspend/clock_in/clock_out son del mock).
export function useAuditFilterOptions() {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: ['admin', 'audit-logs', 'filters'],
    queryFn: () => authJson<AuditFilterOptions>(authFetch, 'GET', '/admin/audit-logs/filters'),
  });
}
