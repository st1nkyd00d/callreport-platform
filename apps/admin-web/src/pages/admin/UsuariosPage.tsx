import { useMemo, useState } from 'react';
import type { Role } from '@callreport/shared';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Pill, type PillVariant } from '../../components/Pill';
import { SlideOver } from '../../components/SlideOver';
import { Toast } from '../../components/Toast';
import { useTenants } from '../../api/tenants';
import { useCreateUser, useUpdateUser, useUsers } from '../../api/users';
import { ApiError } from '../../api/client';
import { relativeTime, initials } from '../../lib/format';

const roleFilters: { label: string; value: Role | 'all' }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Agentes', value: 'agent' },
  { label: 'Supervisores', value: 'supervisor' },
  { label: 'Usuarios cliente', value: 'client_user' },
];

const roleVariant: Record<Role, PillVariant> = {
  agent: 'primary',
  supervisor: 'purple',
  client_user: 'teal',
  super_admin: 'primary',
};
const roleLabel: Record<Role, string> = {
  agent: 'Agente',
  supervisor: 'Supervisor',
  client_user: 'Cliente',
  super_admin: 'Propietario',
};
const statusVariant: Record<string, PillVariant> = { active: 'success', inactive: 'warning', blocked: 'error' };
const statusLabel: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado' };

export function UsuariosPage() {
  const usersQuery = useUsers();
  const tenantsQuery = useTenants();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const users = usersQuery.data ?? [];
  const tenants = tenantsQuery.data ?? [];

  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: Role;
    tenantId: string;
  }>({ fullName: '', email: '', password: '', role: 'agent', tenantId: '' });

  const rows = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const q = search.toLowerCase();
      const matchesSearch = !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, search]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 8) return;
    try {
      await createUser.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        tenantId: form.role === 'client_user' ? form.tenantId : undefined,
      });
      setForm({ fullName: '', email: '', password: '', role: 'agent', tenantId: tenants[0]?.id ?? '' });
      setOpen(false);
      showToast('Usuario creado correctamente');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear el usuario');
    }
  }

  async function handleToggleStatus(u: { id: string; fullName: string; status: string }) {
    const next = u.status === 'active' ? 'blocked' : 'active';
    try {
      await updateUser.mutateAsync({ id: u.id, patch: { status: next as 'active' | 'blocked' } });
      showToast(next === 'active' ? `${u.fullName} reactivado` : `${u.fullName} bloqueado`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo actualizar el usuario');
    }
  }

  return (
    <AdminLayout title="Usuarios">
      <div className="relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md mb-md">
          <div>
            <p className="font-body-md text-body-md text-on-surface-variant">Gestiona el acceso y roles de todo el personal.</p>
          </div>
          <button
            onClick={() => {
              setForm((f) => ({ ...f, tenantId: tenants[0]?.id ?? '' }));
              setOpen(true);
            }}
            className="bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-lg py-sm rounded-full flex items-center justify-center gap-sm transition-colors shadow-sm whitespace-nowrap"
          >
            <Icon name="add" className="text-[20px]" /> Nuevo usuario
          </button>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm flex flex-col lg:flex-row items-center gap-md shadow-sm mb-md">
          <div className="flex items-center gap-xs overflow-x-auto w-full lg:w-auto pb-sm lg:pb-0 hide-scrollbar border-b lg:border-b-0 lg:border-r border-outline-variant lg:pr-md">
            {roleFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setRoleFilter(f.value)}
                className={`px-md py-[6px] rounded-full font-label-md text-label-md whitespace-nowrap transition-colors ${
                  roleFilter === f.value ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 w-full relative">
            <Icon name="search" className="absolute left-sm top-1/2 -translate-y-1/2 text-outline" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-xl pr-md py-sm bg-background border border-outline-variant rounded-lg font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="Buscar por nombre, correo o empresa..."
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead className="bg-surface">
                <tr>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase">Nombre</th>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase">Correo</th>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase">Rol</th>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase">Empresa</th>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase">Estado</th>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase">Creado</th>
                  <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50 font-body-md text-body-md text-on-background">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors h-[48px]">
                    <td className="px-md py-sm font-semibold flex items-center gap-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-label-sm text-label-sm">{initials(u.fullName)}</div>
                      {u.fullName}
                    </td>
                    <td className="px-md py-sm text-on-surface-variant">{u.email}</td>
                    <td className="px-md py-sm">
                      <Pill variant={roleVariant[u.role]}>{roleLabel[u.role]}</Pill>
                    </td>
                    <td className="px-md py-sm">{u.tenantId ? tenants.find((t) => t.id === u.tenantId)?.name : '—'}</td>
                    <td className="px-md py-sm">
                      <Pill variant={statusVariant[u.status]}>{statusLabel[u.status]}</Pill>
                    </td>
                    <td className="px-md py-sm text-on-surface-variant">{relativeTime(u.createdAt)}</td>
                    <td className="px-md py-sm text-right">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className="text-outline hover:text-primary transition-colors p-1"
                        title={u.status === 'active' ? 'Bloquear' : 'Reactivar'}
                      >
                        <Icon name={u.status === 'active' ? 'block' : 'check_circle'} className="text-[20px]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-md py-sm border-t border-outline-variant bg-surface flex items-center justify-between">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Mostrando {rows.length} de {users.length} usuarios</span>
          </div>
        </div>

        <SlideOver
          open={open}
          title="Nuevo usuario"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="px-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md rounded shadow-sm hover:bg-surface-container transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={createUser.isPending} className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md rounded shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-60">
                {createUser.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Nombre completo</label>
            <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-body-md" placeholder="Ej. Sofía Ríos" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Correo</label>
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-body-md" placeholder="nombre@empresa.com" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Contraseña inicial</label>
            <input
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              type="password"
              minLength={8}
              className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-body-md"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Rol</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              <option value="agent">Agente</option>
              <option value="supervisor">Supervisor</option>
              <option value="client_user">Usuario cliente</option>
            </select>
          </div>
          {form.role === 'client_user' && (
            <div className="flex flex-col gap-2">
              <label className="font-label-md text-label-md text-on-surface">Empresa</label>
              <select value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </SlideOver>
      </div>
      <Toast message={toast} />
    </AdminLayout>
  );
}
