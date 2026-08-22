import { useState } from 'react';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { ReportCard } from '../../../components/ReportCard';
import { useStore } from '../../../store/AppStore';
import { clientTabsBase } from '../../../lib/tabs';
import { dispositionById, isPendingFollowup } from '../../../lib/selectors';
import type { CallReport } from '@callreport/shared';

function sortList(list: CallReport[]): CallReport[] {
  const withSchedule = list
    .filter((r) => r.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  const withoutSchedule = list
    .filter((r) => !r.scheduledAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return [...withSchedule, ...withoutSchedule];
}

export function SeguimientosPage() {
  const { state, currentUser } = useStore();
  const [tab, setTab] = useState<'pendientes' | 'resueltos'>('pendientes');

  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;
  const tenantReports = tenant ? state.reports.filter((r) => r.tenantId === tenant.id) : [];
  const followupReports = tenantReports.filter((r) => dispositionById(state, r.dispositionId)?.requiresFollowup);
  const pending = followupReports.filter((r) => isPendingFollowup(state, r));
  const resolved = followupReports.filter((r) => !isPendingFollowup(state, r));
  const list = sortList(tab === 'pendientes' ? pending : resolved);

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
          {list.map((r) => (
            <ReportCard
              key={r.id}
              reportId={r.id}
              overdue={tab === 'pendientes' && !!r.scheduledAt && new Date(r.scheduledAt).getTime() < Date.now()}
            />
          ))}
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
