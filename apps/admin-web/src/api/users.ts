import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@callreport/shared';
import { authJson } from './client';
import { useAdminAuth } from './auth-context';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'active' | 'inactive' | 'blocked';
  tenantId?: string;
  createdAt: string;
}

const usersKey = (role?: Role | 'all') => ['admin', 'users', role ?? 'all'];

export function useUsers(role?: Role) {
  const { authFetch } = useAdminAuth();
  return useQuery({
    queryKey: usersKey(role),
    queryFn: () =>
      authJson<AdminUser[]>(
        authFetch,
        'GET',
        role ? `/admin/users?role=${role}` : '/admin/users',
      ),
  });
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  tenantId?: string;
}

export function useCreateUser() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      authJson<AdminUser>(authFetch, 'POST', '/admin/users', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export interface UpdateUserInput {
  id: string;
  patch: Partial<{ fullName: string; status: AdminUser['status'] }>;
}

export function useUpdateUser() {
  const { authFetch } = useAdminAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateUserInput) =>
      authJson<AdminUser>(authFetch, 'PATCH', `/admin/users/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}
