import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Pill } from '../../components/Pill';
import { SlideOver } from '../../components/SlideOver';
import { Toast } from '../../components/Toast';
import { useCampaigns, useCreateCampaign } from '../../api/campaigns';
import { useTenants } from '../../api/tenants';
import { ApiError } from '../../api/client';

export function CampanasPage() {
  const campaignsQuery = useCampaigns();
  const tenantsQuery = useTenants();
  const createCampaign = useCreateCampaign();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', tenantId: '' });

  const campaigns = campaignsQuery.data ?? [];
  const tenants = tenantsQuery.data ?? [];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.tenantId) return;
    try {
      await createCampaign.mutateAsync({ name: form.name.trim(), tenantId: form.tenantId });
      setForm({ name: '', tenantId: tenants[0]?.id ?? '' });
      setOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear la campaña');
    }
  }

  return (
    <AdminLayout title="Campañas">
      <div className="relative">
        <div className="flex items-center justify-between mb-lg">
          <p className="font-body-md text-body-md text-on-surface-variant">Tipificaciones y agentes asignados por campaña.</p>
          <button
            onClick={() => {
              setForm((f) => ({ ...f, tenantId: tenants[0]?.id ?? '' }));
              setOpen(true);
            }}
            className="bg-primary text-on-primary font-label-md text-label-md px-4 py-2 rounded shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors flex items-center gap-2"
          >
            <Icon name="add" className="text-[20px]" /> Nueva campaña
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
          {campaigns.map((c) => {
            const tenant = tenants.find((t) => t.id === c.tenantId);
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/admin/campanas/${c.id}`)}
                className="text-left bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between mb-sm">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">{c.name}</h3>
                  <Pill variant={c.status === 'active' ? 'success' : 'neutral'}>{c.status === 'active' ? 'Activa' : 'Pausada'}</Pill>
                </div>
                <span className="inline-flex items-center px-sm py-xs bg-surface-container text-on-surface-variant rounded-full font-label-sm text-label-sm border border-outline-variant/30 mb-sm">
                  <Icon name="domain" className="text-[14px] mr-xs" /> {tenant?.name ?? '—'}
                </span>
                <div className="flex items-center gap-md text-body-sm text-on-surface-variant font-body-sm mt-sm">
                  <span className="flex items-center gap-1"><Icon name="groups" className="text-[16px]" /> {c.agentIds.length} agentes</span>
                  <span className="flex items-center gap-1"><Icon name="rule" className="text-[16px]" /> {c.dispositionsCount} tipificaciones</span>
                </div>
              </button>
            );
          })}
        </div>

        <SlideOver
          open={open}
          title="Nueva campaña"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="px-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md rounded shadow-sm hover:bg-surface-container transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={createCampaign.isPending} className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md rounded shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-60">
                {createCampaign.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Nombre de la campaña</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md" placeholder="Ej. Retención Q4" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">Empresa cliente</label>
            <select value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} className="w-full px-3 py-2 border border-outline-variant rounded bg-surface-container-lowest font-body-md text-body-md">
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Se crearán automáticamente las 8 tipificaciones por defecto (editables después).</p>
        </SlideOver>
      </div>
      <Toast message={toast} />
    </AdminLayout>
  );
}
