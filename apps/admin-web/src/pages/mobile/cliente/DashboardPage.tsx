import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { useStore } from '../../../store/AppStore';
import { dispositionById, pendingFollowups } from '../../../lib/selectors';
import { formatTime } from '../../../lib/format';

const clientTabsBase = [
  { to: '/mobile/cliente/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { to: '/mobile/cliente/seguimientos', label: 'Seguimientos', icon: 'history_toggle_off' },
  { to: '/mobile/cliente/exportar', label: 'Exportar', icon: 'download' },
  { to: '/mobile/perfil', label: 'Perfil', icon: 'person' },
];

const rangeChips: { label: string; days: number }[] = [
  { label: 'Hoy', days: 1 },
  { label: 'Semana', days: 7 },
  { label: 'Mes', days: 30 },
];

export function DashboardPage() {
  const { state, currentUser, simulateIncomingReport } = useStore();
  const navigate = useNavigate();
  const [range, setRange] = useState(0);
  const [justArrivedId, setJustArrivedId] = useState<string | null>(null);

  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;
  const pending = tenant ? pendingFollowups(state, tenant.id) : [];

  const filteredReports = useMemo(() => {
    if (!tenant) return [];
    const cutoff = Date.now() - rangeChips[range].days * 24 * 60 * 60 * 1000;
    return state.reports.filter((r) => r.tenantId === tenant.id && new Date(r.createdAt).getTime() >= cutoff);
  }, [state.reports, tenant, range]);

  const counts = useMemo(() => {
    let ventas = 0, seguimientos = 0, noInteresados = 0;
    for (const r of filteredReports) {
      const d = dispositionById(state, r.dispositionId);
      if (d?.label === 'Venta Completada') ventas++;
      else if (d?.requiresFollowup) seguimientos++;
      else if (d?.label === 'No Interesado') noInteresados++;
    }
    return { total: filteredReports.length, ventas, seguimientos, noInteresados };
  }, [filteredReports, state]);

  const feed = filteredReports.slice(0, 10);

  const clientTabs = clientTabsBase.map((t) => (t.to.includes('seguimientos') ? { ...t, badge: pending.length } : t));

  function handleSimulate() {
    if (!tenant) return;
    const created = simulateIncomingReport(tenant.id);
    if (created) {
      setJustArrivedId(created.id);
      setTimeout(() => setJustArrivedId(null), 2200);
    }
  }

  if (!tenant) {
    return <div className="p-lg font-body-md text-body-md text-on-surface-variant">Selecciona un usuario cliente en el modo demo.</div>;
  }

  return (
    <div className="h-full flex flex-col relative">
      <header className="bg-surface sticky top-0 w-full z-30 flex items-center px-md py-sm border-b border-outline-variant justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="menu" className="text-primary" />
          <div className="flex items-center gap-2">
            <h1 className="font-headline-sm text-headline-sm text-primary font-bold">{tenant.name}</h1>
            <div className="flex items-center gap-1 bg-secondary-fixed/20 px-2 py-0.5 rounded-full border border-secondary-fixed">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="font-label-sm text-label-sm text-secondary">En vivo</span>
            </div>
          </div>
        </div>
        <button onClick={handleSimulate} title="Simular llamada entrante" className="text-primary">
          <Icon name="bolt" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto hide-scrollbar px-md py-md flex flex-col gap-md pb-24">
        <section className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
          {rangeChips.map((c, i) => (
            <button
              key={c.label}
              onClick={() => setRange(i)}
              className={`px-3 py-1 rounded-full font-label-md text-label-md whitespace-nowrap border transition-colors ${
                range === i ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant'
              }`}
            >
              {c.label}
            </button>
          ))}
        </section>

        <section className="grid grid-cols-2 gap-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Total llamadas</span>
              <Icon name="call" className="text-outline text-[16px]" />
            </div>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary">{counts.total}</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Ventas</span>
              <Icon name="monetization_on" className="text-secondary text-[16px]" />
            </div>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-secondary">{counts.ventas}</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Seguimientos</span>
              <Icon name="history_toggle_off" className="text-tertiary-fixed-dim text-[16px]" />
            </div>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-tertiary-container">{counts.seguimientos}</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">No interesados</span>
              <Icon name="block" className="text-error text-[16px]" />
            </div>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{counts.noInteresados}</span>
          </div>
        </section>

        <section className="flex flex-col gap-sm">
          <div className="flex items-center justify-between mt-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Reportes recientes</h2>
            <button onClick={handleSimulate} className="font-label-sm text-label-sm text-primary flex items-center gap-1">
              <Icon name="bolt" className="text-[16px]" /> Simular llamada
            </button>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden divide-y divide-outline-variant">
            {feed.map((r) => {
              const d = dispositionById(state, r.dispositionId);
              const campaign = state.campaigns.find((c) => c.id === r.campaignId);
              const isNew = r.id === justArrivedId;
              const variant = d?.label === 'Venta Completada' ? 'success' : d?.requiresFollowup ? 'warning' : d?.label === 'No Interesado' ? 'error' : 'primary';
              const icon = d?.label === 'Venta Completada' ? 'check_circle' : d?.requiresFollowup ? 'schedule' : d?.label === 'No Interesado' ? 'cancel' : 'support_agent';
              return (
                <button
                  key={r.id}
                  onClick={() => navigate(`/mobile/cliente/reporte/${r.id}`)}
                  className={`w-full text-left p-sm flex flex-col gap-xs ${isNew ? 'animate-pulse-subtle border-l-4 border-l-primary' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{formatTime(r.createdAt)}</span>
                    <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm flex items-center gap-1 border ${
                      variant === 'success' ? 'bg-secondary/10 text-secondary border-secondary/20' :
                      variant === 'warning' ? 'bg-tertiary-fixed-dim/20 text-tertiary-container border-tertiary-fixed-dim/30' :
                      variant === 'error' ? 'bg-error/10 text-error border-error/20' :
                      'bg-primary/10 text-primary border-primary/20'
                    }`}>
                      <Icon name={icon} className="text-[14px]" /> {d?.label}
                    </span>
                  </div>
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">{r.contactName}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Campaña: {campaign?.name}</p>
                  </div>
                </button>
              );
            })}
            {feed.length === 0 && <p className="p-md text-center font-body-md text-body-md text-on-surface-variant">Aún no hay reportes en este rango.</p>}
          </div>
        </section>
      </main>
      <BottomTabBar items={clientTabs} active="/mobile/cliente/dashboard" />
    </div>
  );
}
