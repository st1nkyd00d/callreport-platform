import { useQuery } from '@tanstack/react-query';
import { authJson } from './client';
import { useAdminAuth } from './auth-context';

// Fase 6 (plan.md): página "Métricas" -- Recharts sobre datos reales del
// API en vez del AppStore mock. Mismo patrón que api/tenants.ts.
export interface DateRange {
  from: string;
  to: string;
}

export interface AgentDispositionBreakdown {
  dispositionId: string;
  label: string;
  code: string | null;
  color: string | null;
  requiresFollowup: boolean;
  count: number;
}

export interface AgentMetric {
  agentId: string;
  fullName: string;
  total: number;
  activeHours: number;
  perActiveHour: number;
  byDisposition: AgentDispositionBreakdown[];
}

export interface OverviewMetrics {
  totalReports: number;
  activeTenants: number;
  pendingFollowups: number;
  agentsOnShift: number;
  byDay: { date: string; count: number }[];
  byTenant: { tenantId: string; name: string; count: number }[];
  byCampaign: { campaignId: string; name: string; count: number }[];
}

function buildQuery(range: DateRange): string {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

export function useAgentMetrics(range: DateRange) {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: ['admin', 'metrics', 'agents', range],
    queryFn: () =>
      authJson<AgentMetric[]>(authFetch, 'GET', `/admin/metrics/agents${buildQuery(range)}`),
  });
}

export function useOverviewMetrics(range: DateRange) {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: ['admin', 'metrics', 'overview', range],
    queryFn: () =>
      authJson<OverviewMetrics>(authFetch, 'GET', `/admin/metrics/overview${buildQuery(range)}`),
  });
}
