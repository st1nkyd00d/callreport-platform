import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { useStore } from '../../../store/AppStore';
import { dispositionById, isPendingFollowup } from '../../../lib/selectors';
import { relativeTime } from '../../../lib/format';

const clientTabsBase = [
  { to: '/mobile/cliente/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { to: '/mobile/cliente/seguimientos', label: 'Seguimientos', icon: 'history_toggle_off' },
  { to: '/mobile/cliente/exportar', label: 'Exportar', icon: 'download' },
  { to: '/mobile/perfil', label: 'Perfil', icon: 'person' },
];

export function SeguimientosPage() {
  const { state, currentUser, resolveFollowup } = useStore();
  const [tab, setTab] = useState<'pendientes' | 'resueltos'>('pendientes');

  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;
  const tenantReports = tenant ? state.reports.filter((r) => r.tenantId === tenant.id) : [];
  const followupReports = tenantReports.filter((r) => dispositionById(state, r.dispositionId)?.requiresFollowup);
  const pending = followupReports.filter((r) => isPendingFollowup(state, r));
  const resolved = followupReports.filter((r) => !isPendingFollowup(state, r));
  const list = tab === 'pendientes' ? pending : resolved;

  const clientTabs = clientTabsBase.map((t) => (t.to.includes('seguimientos') ? { ...t, badge: pending.length } : t));

  if (!tenant) {
    return <div className="p-lg font-body-md text-body-md text-on-surface-variant">Selecciona un usuario cliente en el modo demo.</div>;
  }

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="CallReport" />
      <main className="flex-1 overflow-y-auto hide-scrollbar px-md pt-lg pb-24 flex flex-col gap-md">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-md">Seguimientos</h2>
          <div className="flex bg-surface-container-low p-1 rounded-lg w-full">
            <button onClick={() => setTab('pendientes')} className={`flex-1 py-2 text-center rounded-md font-label-md text-label-md transition-colors ${tab === 'pendientes' ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant'}`}>
              Pendientes ({pending.length})
            </button>
            <button onClick={() => setTab('resueltos')} className={`flex-1 py-2 text-center rounded-md font-label-md text-label-md transition-colors ${tab === 'resueltos' ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant'}`}>
              Resueltos
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-sm">
          {list.map((r) => {
            const campaign = state.campaigns.find((c) => c.id === r.campaignId);
            return (
              <div key={r.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center justify-between shadow-sm">
                <div className="flex flex-col gap-xs flex-1">
                  <div className="flex justify-between items-start w-full">
                    <span className="font-label-md text-label-md text-on-surface">{r.contactName}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{relativeTime(r.createdAt)}</span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{r.contactPhone}</span>
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-label-sm text-label-sm">{campaign?.name}</span>
                  </div>
                </div>
                {tab === 'pendientes' ? (
                  <button
                    onClick={() => resolveFollowup(r.id)}
                    className="ml-md w-10 h-10 flex-shrink-0 rounded-full border border-outline-variant flex items-center justify-center text-outline hover:bg-secondary hover:text-on-secondary hover:border-secondary transition-colors"
                    title="Resolver"
                  >
                    <Icon name="check" />
                  </button>
                ) : (
                  <div className="ml-md w-10 h-10 flex-shrink-0 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                    <Icon name="check_circle" filled />
                  </div>
                )}
              </div>
            );
          })}
          {list.length === 0 && (
            <p className="text-center font-body-md text-body-md text-on-surface-variant py-xl">
              {tab === 'pendientes' ? 'Sin seguimientos pendientes.' : 'Aún no hay seguimientos resueltos.'}
            </p>
          )}
        </div>
      </main>
      <BottomTabBar items={clientTabs} active="/mobile/cliente/seguimientos" />
    </div>
  );
}
