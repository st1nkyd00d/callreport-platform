import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authJson } from './client';
import { useAdminAuth } from './auth-context';

export interface AdminCampaign {
  id: string;
  tenantId: string;
  name: string;
  status: 'active' | 'paused';
  agentIds: string[];
  dispositionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDisposition {
  id: string;
  campaignId: string;
  label: string;
  code?: string | null;
  sortOrder: number;
  requiresFollowup: boolean;
  requiresDetail: boolean;
  requiresSchedule: boolean;
  isActive: boolean;
  color?: string | null;
  icon?: string | null;
}

const CAMPAIGNS_KEY = ['admin', 'campaigns'];
const dispositionsKey = (campaignId: string) => ['admin', 'campaigns', campaignId, 'dispositions'];

export function useCampaigns() {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: CAMPAIGNS_KEY,
    queryFn: () => authJson<AdminCampaign[]>(authFetch, 'GET', '/admin/campaigns'),
  });
}

export interface CreateCampaignInput {
  name: string;
  tenantId: string;
}

export function useCreateCampaign() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCampaignInput) =>
      authJson<AdminCampaign>(authFetch, 'POST', '/admin/campaigns', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}

export interface UpdateCampaignInput {
  id: string;
  patch: Partial<{ name: string; status: AdminCampaign['status'] }>;
}

export function useUpdateCampaign() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateCampaignInput) =>
      authJson<AdminCampaign>(authFetch, 'PATCH', `/admin/campaigns/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}

export function useSetCampaignAgents() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, agentIds }: { campaignId: string; agentIds: string[] }) =>
      authJson<AdminCampaign>(authFetch, 'PUT', `/admin/campaigns/${campaignId}/agents`, {
        agentIds,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}

export function useDispositions(campaignId: string) {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: dispositionsKey(campaignId),
    queryFn: () =>
      authJson<AdminDisposition[]>(
        authFetch,
        'GET',
        `/admin/campaigns/${campaignId}/dispositions`,
      ),
    enabled: !!campaignId,
  });
}

export interface CreateDispositionInput {
  campaignId: string;
  label: string;
  requiresFollowup?: boolean;
  requiresDetail?: boolean;
  requiresSchedule?: boolean;
}

export function useCreateDisposition() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, ...data }: CreateDispositionInput) =>
      authJson<AdminDisposition>(
        authFetch,
        'POST',
        `/admin/campaigns/${campaignId}/dispositions`,
        data,
      ),
    onSuccess: (_result, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: dispositionsKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
    },
  });
}

export interface UpdateDispositionInput {
  campaignId: string;
  dispositionId: string;
  patch: Partial<
    Pick<
      AdminDisposition,
      'label' | 'sortOrder' | 'requiresFollowup' | 'requiresDetail' | 'requiresSchedule' | 'isActive'
    >
  >;
}

export function useUpdateDisposition() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, dispositionId, patch }: UpdateDispositionInput) =>
      authJson<AdminDisposition>(
        authFetch,
        'PATCH',
        `/admin/campaigns/${campaignId}/dispositions/${dispositionId}`,
        patch,
      ),
    onSuccess: (_result, { campaignId }) =>
      queryClient.invalidateQueries({ queryKey: dispositionsKey(campaignId) }),
  });
}
