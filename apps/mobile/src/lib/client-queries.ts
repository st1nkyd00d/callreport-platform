import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { authJson } from './api-json';
import { useAuth } from './auth-context';
import type {
  ClientCampaign,
  ClientReport,
  Disposition,
  ReportFilters,
  ReportsPage,
  ReportsSummary,
} from './client-types';

// Hooks de React Query para el dashboard del cliente (Fase 5). Mismo
// patrón que agent-queries.ts: cada hook resuelve authFetch desde
// useAuth().

function buildQuery(filters: ReportFilters, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.dispositionIds?.length) {
    params.set('dispositionId', filters.dispositionIds.join(','));
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useClientCampaigns() {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['client-campaigns'],
    queryFn: () => authJson<ClientCampaign[]>(authFetch, 'GET', '/client/campaigns'),
  });
}

export function useClientDispositions() {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['client-dispositions'],
    queryFn: () => authJson<Disposition[]>(authFetch, 'GET', '/client/dispositions'),
  });
}

// Feed principal del dashboard, paginado por cursor (plan.md Fase 5).
export function useClientReports(filters: ReportFilters) {
  const { authFetch } = useAuth();
  return useInfiniteQuery({
    queryKey: ['client-reports', filters],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      authJson<ReportsPage>(
        authFetch,
        'GET',
        `/reports${buildQuery(filters, pageParam ? { after: pageParam } : undefined)}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useReportsSummary(filters: ReportFilters) {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['reports-summary', filters],
    queryFn: () => authJson<ReportsSummary>(authFetch, 'GET', `/reports/summary${buildQuery(filters)}`),
  });
}

// Carrusel de "Próximas citas" (decisión tomada al planificar la Fase 5,
// fuera de plan.md pero alimentada por el mismo índice
// (tenant_id, scheduled_at) del schema).
export function useUpcomingAppointments() {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['upcoming-appointments'],
    queryFn: () =>
      authJson<ReportsPage>(
        authFetch,
        'GET',
        `/reports?scheduledFrom=${encodeURIComponent(new Date().toISOString())}&limit=10`,
      ),
    select: (data) => data.items,
  });
}

export function useReportDetail(id: string | null) {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['report-detail', id],
    queryFn: () => authJson<ClientReport>(authFetch, 'GET', `/reports/${id}`),
    enabled: !!id,
  });
}
