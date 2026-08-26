import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';
import { authJson } from './api-json';
import { useAuth } from './auth-context';
import * as reportQueue from './report-queue';
import type {
  AgentCampaign,
  AgentReport,
  CreateReportInput,
  Disposition,
  Shift,
  UpdateReportInput,
} from './agent-types';

// Hooks de React Query para el flujo del agente (Fase 4). Cada hook
// resuelve authFetch desde useAuth() -- ya reintenta una vez en 401 y
// mantiene la sesión sincronizada (ver auth-context.tsx).

export function useAgentCampaigns() {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['agent-campaigns'],
    queryFn: () => authJson<AgentCampaign[]>(authFetch, 'GET', '/agent/campaigns'),
  });
}

export function useDispositions(campaignId: string | null) {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['dispositions', campaignId],
    queryFn: () =>
      authJson<Disposition[]>(authFetch, 'GET', `/campaigns/${campaignId}/dispositions`),
    enabled: !!campaignId,
  });
}

export function useAgentReports(range: 'today' | 'week') {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['agent-reports', range],
    queryFn: () => authJson<AgentReport[]>(authFetch, 'GET', `/agent/reports?range=${range}`),
  });
}

export function useCurrentShift() {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['shift-current'],
    queryFn: () => authJson<Shift | null>(authFetch, 'GET', '/agent/shifts/current'),
  });
}

export function useShiftHistory(days = 7) {
  const { authFetch } = useAuth();
  return useQuery({
    queryKey: ['shift-history', days],
    queryFn: () => authJson<Shift[]>(authFetch, 'GET', `/agent/shifts?days=${days}`),
  });
}

export type CreateReportResult =
  | { status: 'created'; report: AgentReport }
  | { status: 'queued' };

// Un ApiError (400/403/409/...) es un rechazo real del servidor: se
// relanza para que el formulario lo muestre. Cualquier otro error (fetch
// nunca llegó a responder -- sin conexión) encola el reporte y devuelve
// 'queued' en vez de fallar: el agente ve confirmación igual, no un error.
export function useCreateReport() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReportInput): Promise<CreateReportResult> => {
      try {
        const report = await authJson<AgentReport>(authFetch, 'POST', '/reports', input);
        return { status: 'created', report };
      } catch (e) {
        if (e instanceof ApiError) throw e;
        await reportQueue.enqueue(input);
        return { status: 'queued' };
      }
    },
    onSuccess: (result) => {
      if (result.status === 'created') {
        void queryClient.invalidateQueries({ queryKey: ['agent-reports'] });
        void queryClient.invalidateQueries({ queryKey: ['shift-current'] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['report-queue'] });
      }
    },
  });
}

export function useUpdateReport() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateReportInput }) =>
      authJson<AgentReport>(authFetch, 'PATCH', `/reports/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-reports'] });
    },
  });
}

export function useClockIn() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authJson<Shift>(authFetch, 'POST', '/agent/shifts/clock-in'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shift-current'] });
      void queryClient.invalidateQueries({ queryKey: ['shift-history'] });
    },
  });
}

export function useClockOut() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authJson<Shift>(authFetch, 'POST', '/agent/shifts/clock-out'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shift-current'] });
      void queryClient.invalidateQueries({ queryKey: ['shift-history'] });
    },
  });
}

export function useReportQueue() {
  return useQuery({
    queryKey: ['report-queue'],
    queryFn: () => reportQueue.list(),
  });
}

export function useRetryQueue() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reportQueue.flush(authFetch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-reports'] });
    },
  });
}

export function useDiscardQueuedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (localId: string) => reportQueue.remove(localId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-queue'] });
    },
  });
}
