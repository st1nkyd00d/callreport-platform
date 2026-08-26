import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Toggle } from '../../components/Toggle';
import { Toast } from '../../components/Toast';
import {
  useCampaigns,
  useCreateDisposition,
  useDispositions,
  useSetCampaignAgents,
  useUpdateCampaign,
  useUpdateDisposition,
} from '../../api/campaigns';
import { useTenants } from '../../api/tenants';
import { useUsers } from '../../api/users';
import { ApiError } from '../../api/client';

export function CampanaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const campaignsQuery = useCampaigns();
  const tenantsQuery = useTenants();
  const dispositionsQuery = useDispositions(id ?? '');
  const agentsQuery = useUsers('agent');

  const updateCampaign = useUpdateCampaign();
  const updateDisposition = useUpdateDisposition();
  const createDisposition = useCreateDisposition();
  const setCampaignAgents = useSetCampaignAgents();

  const [tab, setTab] = useState<'tipificaciones' | 'agentes'>('tipificaciones');
  const [toast, setToast] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newRequiresFollowup, setNewRequiresFollowup] = useState(false);
  const [newRequiresDetail, setNewRequiresDetail] = useState(false);
  const [newRequiresSchedule, setNewRequiresSchedule] = useState(false);

  const campaign = campaignsQuery.data?.find((c) => c.id === id);
  const tenant = campaign ? tenantsQuery.data?.find((t) => t.id === campaign.tenantId) : undefined;

  if (!campaign || !tenant) {
    return (
      <AdminLayout title="Campaña no encontrada">
        <button onClick={() => navigate('/admin/campanas')} className="text-primary underline">Volver a Campañas</button>
      </AdminLayout>
    );
  }

  const dispositions = [...(dispositionsQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const agents = agentsQuery.data ?? [];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function handleUpdateDisposition(dispositionId: string, patch: Parameters<typeof updateDisposition.mutateAsync>[0]['patch']) {
    try {
      await updateDisposition.mutateAsync({ campaignId: campaign!.id, dispositionId, patch });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo actualizar la tipificación');
    }
  }

  async function handleMoveDisposition(index: number, direction: 'up' | 'down') {
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= dispositions.length) return;
    const a = dispositions[index];
    const b = dispositions[swapWith];
    await Promise.all([
      updateDisposition.mutateAsync({ campaignId: campaign!.id, dispositionId: a.id, patch: { sortOrder: b.sortOrder } }),
      updateDisposition.mutateAsync({ campaignId: campaign!.id, dispositionId: b.id, patch: { sortOrder: a.sortOrder } }),
    ]);
  }

  async function handleToggleAgent(agentId: string) {
    const assigned = campaign!.agentIds.includes(agentId);
    const nextAgentIds = assigned
      ? campaign!.agentIds.filter((a) => a !== agentId)
      : [...campaign!.agentIds, agentId];
    try {
      await setCampaignAgents.mutateAsync({ campaignId: campaign!.id, agentIds: nextAgentIds });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo actualizar la asignación');
    }
  }

  return (
    <AdminLayout title={campaign.name}>
      <nav className="flex items-center text-on-surface-variant font-body-sm text-body-sm gap-xs mb-md">
        <Link to="/admin/campanas" className="hover:text-primary transition-colors">Campañas</Link>
        <Icon name="chevron_right" className="text-[16px]" />
        <span>{tenant.name}</span>
        <Icon name="chevron_right" className="text-[16px]" />
        <span className="font-label-sm text-on-surface">{campaign.name}</span>
      </nav>

      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-md mb-lg">
        <div className="space-y-sm">
          <div className="flex items-center gap-sm">
            <h1 className="font-headline-lg text-headline-lg text-on-background">{campaign.name}</h1>
            <span className="inline-flex items-center px-sm py-xs bg-surface-container text-on-surface-variant rounded-full font-label-sm text-label-sm border border-outline-variant/30">
              <Icon name="domain" className="text-[14px] mr-xs" /> {tenant.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-sm bg-surface-container-lowest p-sm rounded-lg border border-outline-variant shadow-sm h-fit">
          <span className="font-label-md text-label-md text-on-background">Estado de campaña</span>
          <Toggle
            checked={campaign.status === 'active'}
            onChange={async (v) => {
              try {
                await updateCampaign.mutateAsync({ id: campaign.id, patch: { status: v ? 'active' : 'paused' } });
                showToast(v ? 'Campaña activada' : 'Campaña pausada');
              } catch (err) {
                showToast(err instanceof ApiError ? err.message : 'No se pudo actualizar la campaña');
              }
            }}
          />
        </div>
      </header>

      <div className="border-b border-outline-variant mb-md">
        <nav className="flex gap-lg">
          <button onClick={() => setTab('tipificaciones')} className={`py-sm px-xs font-label-md text-label-md border-b-2 transition-colors ${tab === 'tipificaciones' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            Tipificaciones
          </button>
          <button onClick={() => setTab('agentes')} className={`py-sm px-xs font-label-md text-label-md border-b-2 transition-colors ${tab === 'agentes' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            Agentes asignados
          </button>
        </nav>
      </div>

      {tab === 'tipificaciones' && (
        <section className="space-y-md">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-sm">
            <div className="hidden md:grid grid-cols-[48px_1fr_150px_120px_120px_100px] gap-md px-md py-sm bg-surface-container-low border-b border-outline-variant font-label-sm text-label-sm text-on-surface-variant uppercase">
              <div></div>
              <div>Etiqueta de resultado</div>
              <div>Regla de seguimiento</div>
              <div>Requiere detalle</div>
              <div>Requiere fecha</div>
              <div>Estado</div>
            </div>
            <div className="divide-y divide-outline-variant/50">
              {dispositions.map((d, idx) => (
                <div key={d.id} className={`flex flex-col md:grid md:grid-cols-[48px_1fr_150px_120px_120px_100px] gap-sm md:gap-md items-start md:items-center p-md hover:bg-surface-bright transition-colors ${!d.isActive ? 'opacity-60' : ''}`}>
                  <div className="hidden md:flex flex-col gap-0.5">
                    <button disabled={idx === 0} onClick={() => handleMoveDisposition(idx, 'up')} className="text-outline hover:text-primary disabled:opacity-30">
                      <Icon name="keyboard_arrow_up" className="text-[18px]" />
                    </button>
                    <button disabled={idx === dispositions.length - 1} onClick={() => handleMoveDisposition(idx, 'down')} className="text-outline hover:text-primary disabled:opacity-30">
                      <Icon name="keyboard_arrow_down" className="text-[18px]" />
                    </button>
                  </div>
                  <div className="font-label-md text-label-md text-on-background">{d.label}</div>
                  <div>
                    <label className="inline-flex items-center gap-xs cursor-pointer">
                      <Toggle size="sm" checked={d.requiresFollowup} onChange={(v) => handleUpdateDisposition(d.id, { requiresFollowup: v })} />
                      <span className={`font-label-sm text-label-sm ${d.requiresFollowup ? 'text-[#E65100]' : 'text-on-surface-variant'}`}>
                        {d.requiresFollowup ? 'Requiere seguimiento' : 'Sin seguimiento'}
                      </span>
                    </label>
                  </div>
                  <div>
                    <Toggle size="sm" checked={d.requiresDetail} onChange={(v) => handleUpdateDisposition(d.id, { requiresDetail: v })} />
                  </div>
                  <div>
                    <Toggle size="sm" checked={d.requiresSchedule} onChange={(v) => handleUpdateDisposition(d.id, { requiresSchedule: v })} />
                  </div>
                  <div className="flex items-center">
                    <Toggle checked={d.isActive} onChange={(v) => handleUpdateDisposition(d.id, { isActive: v })} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md flex flex-col gap-md">
            <div className="flex flex-col gap-1 w-full">
              <label className="font-label-sm text-label-sm text-on-surface-variant">Nueva tipificación</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej. Reagendar llamada" className="w-full px-3 py-2 border border-outline-variant rounded bg-background font-body-md text-body-md" />
            </div>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-md flex-wrap">
              <label className="flex items-center gap-xs">
                <Toggle size="sm" checked={newRequiresFollowup} onChange={setNewRequiresFollowup} />
                <span className="font-label-sm text-label-sm text-on-surface-variant">Requiere seguimiento</span>
              </label>
              <label className="flex items-center gap-xs">
                <Toggle size="sm" checked={newRequiresDetail} onChange={setNewRequiresDetail} />
                <span className="font-label-sm text-label-sm text-on-surface-variant">Requiere detalle</span>
              </label>
              <label className="flex items-center gap-xs">
                <Toggle size="sm" checked={newRequiresSchedule} onChange={setNewRequiresSchedule} />
                <span className="font-label-sm text-label-sm text-on-surface-variant">Requiere fecha (cita)</span>
              </label>
              <button
                onClick={async () => {
                  if (!newLabel.trim()) return;
                  try {
                    await createDisposition.mutateAsync({
                      campaignId: campaign.id,
                      label: newLabel.trim(),
                      requiresFollowup: newRequiresFollowup,
                      requiresDetail: newRequiresDetail,
                      requiresSchedule: newRequiresSchedule,
                    });
                    setNewLabel('');
                    setNewRequiresFollowup(false);
                    setNewRequiresDetail(false);
                    setNewRequiresSchedule(false);
                    showToast('Tipificación agregada');
                  } catch (err) {
                    showToast(err instanceof ApiError ? err.message : 'No se pudo agregar la tipificación');
                  }
                }}
                className="flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity shadow-sm whitespace-nowrap md:ml-auto"
              >
                <Icon name="add" className="text-[18px]" /> Agregar tipificación
              </button>
            </div>
          </div>
        </section>
      )}

      {tab === 'agentes' && (
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-sm">
          <div className="divide-y divide-outline-variant/50">
            {agents.map((a) => {
              const assigned = campaign.agentIds.includes(a.id);
              return (
                <label key={a.id} className="flex items-center justify-between p-md hover:bg-surface-container-low transition-colors cursor-pointer">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-label-sm text-label-sm">
                      {a.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface">{a.fullName}</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{a.email}</span>
                    </div>
                  </div>
                  <Toggle checked={assigned} onChange={() => handleToggleAgent(a.id)} />
                </label>
              );
            })}
          </div>
        </section>
      )}
      <Toast message={toast} />
    </AdminLayout>
  );
}
