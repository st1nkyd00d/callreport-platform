import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Toggle } from '../../components/Toggle';
import { Toast } from '../../components/Toast';
import { useStore } from '../../store/AppStore';

export function CampanaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, updateCampaign, updateDisposition, addDisposition, moveDisposition, toggleCampaignAgent } = useStore();
  const [tab, setTab] = useState<'tipificaciones' | 'agentes'>('tipificaciones');
  const [toast, setToast] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newRequiresFollowup, setNewRequiresFollowup] = useState(false);

  const campaign = state.campaigns.find((c) => c.id === id);
  const tenant = campaign ? state.tenants.find((t) => t.id === campaign.tenantId) : undefined;

  if (!campaign || !tenant) {
    return (
      <AdminLayout title="Campaña no encontrada">
        <button onClick={() => navigate('/admin/campanas')} className="text-primary underline">Volver a Campañas</button>
      </AdminLayout>
    );
  }

  const dispositions = state.dispositions.filter((d) => d.campaignId === campaign.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const agents = state.users.filter((u) => u.role === 'agent');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
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
            onChange={(v) => {
              updateCampaign(campaign.id, { status: v ? 'active' : 'paused' });
              showToast(v ? 'Campaña activada' : 'Campaña pausada');
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
            <div className="hidden md:grid grid-cols-[48px_1fr_200px_120px] gap-md px-md py-sm bg-surface-container-low border-b border-outline-variant font-label-sm text-label-sm text-on-surface-variant uppercase">
              <div></div>
              <div>Etiqueta de resultado</div>
              <div>Regla de seguimiento</div>
              <div>Estado</div>
            </div>
            <div className="divide-y divide-outline-variant/50">
              {dispositions.map((d, idx) => (
                <div key={d.id} className={`flex flex-col md:grid md:grid-cols-[48px_1fr_200px_120px] gap-sm md:gap-md items-start md:items-center p-md hover:bg-surface-bright transition-colors ${!d.isActive ? 'opacity-60' : ''}`}>
                  <div className="hidden md:flex flex-col gap-0.5">
                    <button disabled={idx === 0} onClick={() => moveDisposition(campaign.id, d.id, 'up')} className="text-outline hover:text-primary disabled:opacity-30">
                      <Icon name="keyboard_arrow_up" className="text-[18px]" />
                    </button>
                    <button disabled={idx === dispositions.length - 1} onClick={() => moveDisposition(campaign.id, d.id, 'down')} className="text-outline hover:text-primary disabled:opacity-30">
                      <Icon name="keyboard_arrow_down" className="text-[18px]" />
                    </button>
                  </div>
                  <div className="font-label-md text-label-md text-on-background">{d.label}</div>
                  <div>
                    <label className="inline-flex items-center gap-xs cursor-pointer">
                      <Toggle size="sm" checked={d.requiresFollowup} onChange={(v) => updateDisposition(d.id, { requiresFollowup: v })} />
                      <span className={`font-label-sm text-label-sm ${d.requiresFollowup ? 'text-[#E65100]' : 'text-on-surface-variant'}`}>
                        {d.requiresFollowup ? 'Requiere seguimiento' : 'Sin seguimiento'}
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center">
                    <Toggle checked={d.isActive} onChange={(v) => updateDisposition(d.id, { isActive: v })} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md flex flex-col md:flex-row items-start md:items-end gap-md">
            <div className="flex flex-col gap-1 flex-1 w-full">
              <label className="font-label-sm text-label-sm text-on-surface-variant">Nueva tipificación</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej. Reagendar llamada" className="w-full px-3 py-2 border border-outline-variant rounded bg-background font-body-md text-body-md" />
            </div>
            <label className="flex items-center gap-xs">
              <Toggle size="sm" checked={newRequiresFollowup} onChange={setNewRequiresFollowup} />
              <span className="font-label-sm text-label-sm text-on-surface-variant">Requiere seguimiento</span>
            </label>
            <button
              onClick={() => {
                if (!newLabel.trim()) return;
                addDisposition(campaign.id, { label: newLabel.trim(), requiresFollowup: newRequiresFollowup });
                setNewLabel('');
                setNewRequiresFollowup(false);
                showToast('Tipificación agregada');
              }}
              className="flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity shadow-sm whitespace-nowrap"
            >
              <Icon name="add" className="text-[18px]" /> Agregar tipificación
            </button>
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
                  <Toggle checked={assigned} onChange={() => toggleCampaignAgent(campaign.id, a.id)} />
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
