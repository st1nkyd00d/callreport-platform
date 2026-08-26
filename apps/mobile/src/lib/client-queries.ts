import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authJson } from './api-json';
import { useAuth } from './auth-context';
import type {
  ClientCampaign,
  ClientReport,
  Disposition,
  FollowupsCount,
  FollowupStatus,
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

// Cola de seguimientos (plan.md Fase 6): mismo patrón de paginación por
// cursor que useClientReports.
export function useFollowups(status: FollowupStatus) {
  const { authFetch } = useAuth();
  return useInfiniteQuery({
    queryKey: ['followups', status],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      authJson<ReportsPage>(
        authFetch,
        'GET',
        `/followups?status=${status}${pageParam ? `&after=${pageParam}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

// Badge del tab "Seguimientos".
export function useFollowupsCount() {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['followups-count'],
    queryFn: () => authJson<FollowupsCount>(authFetch, 'GET', '/followups/count'),
    // El badge no necesita ser instantáneo -- se refresca solo (igual que
    // el resto del dashboard) al reconectar el socket o volver a
    // primer plano (ver realtime.tsx), esto es solo el piso mientras
    // tanto.
    refetchInterval: 60_000,
  });
}

export function useResolveFollowup() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) =>
      authJson<ClientReport>(authFetch, 'POST', `/followups/${reportId}/resolve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['followups'] });
      void queryClient.invalidateQueries({ queryKey: ['followups-count'] });
      void queryClient.invalidateQueries({ queryKey: ['client-reports'] });
    },
  });
}
