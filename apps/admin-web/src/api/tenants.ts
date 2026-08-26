import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tenant } from '@callreport/shared';
import { authJson } from './client';
import { useAdminAuth } from './auth-context';

const TENANTS_KEY = ['admin', 'tenants'];

export function useTenants() {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: TENANTS_KEY,
    queryFn: () => authJson<Tenant[]>(authFetch, 'GET', '/admin/tenants'),
  });
}

export interface CreateTenantInput {
  name: string;
  editWindowMinutes?: number;
}

export function useCreateTenant() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTenantInput) =>
      authJson<Tenant>(authFetch, 'POST', '/admin/tenants', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}

export interface UpdateTenantInput {
  id: string;
  patch: Partial<{ name: string; status: Tenant['status']; editWindowMinutes: number }>;
}

export function useUpdateTenant() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateTenantInput) =>
      authJson<Tenant>(authFetch, 'PATCH', `/admin/tenants/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}
