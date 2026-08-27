import { useMemo, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Pill } from '../../components/Pill';
import { SlideOver } from '../../components/SlideOver';
import { Toggle } from '../../components/Toggle';
import { Toast } from '../../components/Toast';
import { useAdminAuth } from '../../api/auth-context';
import { useCampaigns } from '../../api/campaigns';
import { useCreateTenant, useTenants, useUpdateTenant } from '../../api/tenants';
import { useUsers } from '../../api/users';
import { ApiError } from '../../api/client';
import { useDownloadExport, type ExportFormat } from '../../api/exports';

export function ClientesPage() {
  const { session } = useAdminAuth();
  const tenantsQuery = useTenants();
  const campaignsQuery = useCampaigns();
  const usersQuery = useUsers();
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const downloadExport = useDownloadExport();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', editWindowMinutes: 30, active: true });
  // Fase 7 (plan.md): "exportación global (todos los tenants o uno) para
  // super_admin". Clave = `${tenantId ?? 'all'}-${format}` para poder
  // deshabilitar solo el botón que está descargando, no toda la fila.
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const tenants = tenantsQuery.data ?? [];
  const campaigns = campaignsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const rows = useMemo(() => {
    return tenants
      .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
      .map((t) => ({
        tenant: t,
        campañas: campaigns.filter((c) => c.tenantId === t.id).length,
        usuarios: users.filter((u) => u.tenantId === t.id).length,
      }));
  }, [tenants, campaigns, users, search]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      await createTenant.mutateAsync({ name: form.name.trim(), editWindowMinutes: form.editWindowMinutes });
      setForm({ name: '', editWindowMinutes: 30, active: true });
      setOpen(false);
      showToast('Empresa creada correctamente');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear la empresa');
    }
  }

  async function handleToggleStatus(tenant: { id: string; name: string; status: string }) {
    try {
      await updateTenant.mutateAsync({
        id: tenant.id,
        patch: { status: tenant.status === 'active' ? 'suspended' : 'active' },
      });
      showToast(tenant.status === 'active' ? `${tenant.name} suspendida` : `${tenant.name} reactivada`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo actualizar la empresa');
    }
  }

  async function handleExport(format: ExportFormat, tenantId?: string) {
    const key = `${tenantId ?? 'all'}-${format}`;
    setExportingKey(key);
    try {
      await downloadExport(format, tenantId ? { tenantId } : {});
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo exportar');
    } finally {
      setExportingKey(null);
    }
  }

  return (
    <AdminLayout title="Empresas cliente">
      <div className="relative">
        <div className="flex items-center justify-between mb-lg gap-md flex-wrap">
          <div className="relative w-80 max-w-full">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-outline-variant rounded bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-body-md text-body-md"
              placeholder="Buscar empresa..."
            />
          </div>
          <div className="flex items-center gap-2">
            {session?.user.role === 'super_admin' && (
              <div className="flex items-center gap-1 border border-outline-variant rounded px-2 py-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant pl-1">
                  Exportar todas:
                </span>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={exportingKey === 'all-csv'}
                  className="font-label-sm text-label-sm text-primary underline underline-offset-2 disabled:opacity-50 px-1"
                >
                  {exportingKey === 'all-csv' ? '…' : 'CSV'}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exportingKey === 'all-pdf'}
                  className="font-label-sm text-label-sm text-primary underline underline-offset-2 disabled:opacity-50 px-1"
                >
                  {exportingKey === 'all-pdf' ? '…' : 'PDF'}
                </button>
              </div>
            )}
            <button
              onClick={() => setOpen(true)}
              className="bg-primary text-on-primary font-label-md text-label-md px-4 py-2 rounded shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors flex items-center gap-2"
            >
              <Icon name="add" className="text-[20px]" /> Nueva empresa
            </button>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="px-4 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase">Empresa</th>
                <th className="px-4 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase">Estado</th>
                <th className="px-4 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase">Campañas</th>
                <th className="px-4 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase">Usuarios</th>
                <th className="px-4 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map(({ tenant, campañas, usuarios }) => (
                <tr key={tenant.id} className="hover:bg-surface-container-low transition-colors h-12">
                  <td className="px-4 py-2 font-body-md text-body-md font-semibold text-on-surface">{tenant.name}</td>
                  <td className="px-4 py-2">
                    <Pill variant={tenant.status === 'active' ? 'success' : 'neutral'}>{tenant.status === 'active' ? 'Activa' : 'Suspendida'}</Pill>
                  </td>
                  <td className="px-4 py-2 font-body-md text-body-md">{campañas}</td>
                  <td className="px-4 py-2 font-body-md text-body-md">{usuarios}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleExport('csv', tenant.id)}
                      disabled={exportingKey === `${tenant.id}-csv`}
                      className="text-on-surface-variant hover:text-primary transition-colors text-body-sm underline underline-offset-2 disabled:opacity-50 mr-3"
                    >
                      {exportingKey === `${tenant.id}-csv` ? '…' : 'CSV'}
                    </button>
                    <button
                      onClick={() => handleExport('pdf', tenant.id)}
                      disabled={exportingKey === `${tenant.id}-pdf`}
                      className="text-on-surface-variant hover:text-primary transition-colors text-body-sm underline underline-offset-2 disabled:opacity-50 mr-3"
                    >
                      {exportingKey === `${tenant.id}-pdf` ? '…' : 'PDF'}
                    </button>
                    <button
                      onClick={() => handleToggleStatus(tenant)}
                      className="text-on-surface-variant hover:text-primary transition-colors text-body-sm underline underline-offset-2"
                    >
                      {tenant.status === 'active' ? 'Suspender' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SlideOver
          open={open}
          title="Nueva empresa"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="px-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md rounded shadow-sm hover:bg-surface-container transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={createTenant.isPending} className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md rounded shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-60">
                {createTenant.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Nombre de la empresa</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-body-md text-body-md"
              placeholder="Ej. Stark Industries"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Ventana de edición (minutos)</label>
            <input
              type="number"
              value={form.editWindowMinutes}
              onChange={(e) => setForm((f) => ({ ...f, editWindowMinutes: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-body-md text-body-md"
            />
          </div>
          <div className="flex items-center justify-between pt-sm">
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface">Activa</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Permitir acceso a la plataforma</span>
            </div>
            <Toggle checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </div>
        </SlideOver>
      </div>
      <Toast message={toast} />
    </AdminLayout>
  );
}
