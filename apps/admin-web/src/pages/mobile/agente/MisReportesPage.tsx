import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { useStore } from '../../../store/AppStore';
import { agentTabs } from '../../../lib/tabs';
import { activeHoursFor, dispositionById, dispositionPillVariant, reportsToday } from '../../../lib/selectors';
import { formatAppointment, formatTime, minutesRemainingInWindow } from '../../../lib/format';

export function MisReportesPage() {
  const { state, currentUser, updateReport } = useStore();
  const [range, setRange] = useState<'hoy' | 'semana'>('hoy');

  const mine = state.reports.filter((r) => r.agentId === currentUser?.id);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const filtered = range === 'hoy' ? reportsToday(mine) : mine.filter((r) => new Date(r.createdAt).getTime() >= weekAgo);

  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;
  const editWindow = tenant?.editWindowMinutes ?? 30;
  const followupsCount = filtered.filter((r) => dispositionById(state, r.dispositionId)?.requiresFollowup).length;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const hoursToday = currentUser ? activeHoursFor(state, currentUser.id, todayStart.toISOString()) : 0;

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="CallReport" />
      <main className="flex-1 overflow-y-auto hide-scrollbar px-md py-lg pb-24">
        <h2 className="font-headline-md text-headline-md mb-md text-on-background">Mis reportes</h2>
        <div className="flex bg-surface-container-high rounded-lg p-1 w-full max-w-sm mb-lg">
          <button onClick={() => setRange('hoy')} className={`flex-1 py-2 text-center rounded-md font-label-md text-label-md transition-colors ${range === 'hoy' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}>Hoy</button>
          <button onClick={() => setRange('semana')} className={`flex-1 py-2 text-center rounded-md font-label-md text-label-md transition-colors ${range === 'semana' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}>Esta semana</button>
        </div>

        <div className="flex gap-sm mb-lg overflow-x-auto hide-scrollbar pb-2">
          <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-full px-4 py-2 whitespace-nowrap">
            <Icon name="description" className="text-[18px] text-primary" />
            <span className="font-label-md text-label-md text-on-background">{filtered.length} reportes</span>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-full px-4 py-2 whitespace-nowrap">
            <Icon name="history_toggle_off" className="text-[18px] text-tertiary-container" />
            <span className="font-label-md text-label-md text-on-background">{followupsCount} seguimientos</span>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-full px-4 py-2 whitespace-nowrap">
            <Icon name="punch_clock" className="text-[18px] text-secondary" />
            <span className="font-label-md text-label-md text-on-background">{hoursToday.toFixed(1)}h en turno hoy</span>
          </div>
        </div>

        <div className="flex flex-col gap-md">
          {filtered.map((r) => {
            const disposition = dispositionById(state, r.dispositionId);
            const campaign = state.campaigns.find((c) => c.id === r.campaignId);
            const minsLeft = minutesRemainingInWindow(r.createdAt, editWindow);
            const editable = minsLeft > 0;
            const variant = dispositionPillVariant(disposition?.color);
            const barColor =
              variant === 'success' ? 'bg-secondary' :
              variant === 'warning' ? 'bg-tertiary-container' :
              variant === 'error' ? 'bg-error' :
              variant === 'primary' ? 'bg-primary' :
              variant === 'teal' ? 'bg-teal-500' :
              variant === 'purple' ? 'bg-purple-500' : 'bg-outline';
            return (
              <div key={r.id} className={`bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col gap-sm shadow-sm relative overflow-hidden ${!editable ? 'opacity-80' : ''}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${barColor}`} />
                <div className="flex justify-between items-start pl-xs">
                  <div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mb-1">
                      <Icon name="schedule" className="text-[14px]" /> {formatTime(r.createdAt)} · {campaign?.name}
                    </p>
                    <h3 className="font-label-md text-label-md text-on-background">{r.contactName}</h3>
                    <p className="font-body-sm text-body-sm text-outline mt-1">ID: {r.id}</p>
                    {r.scheduledAt && (
                      <p className="font-body-sm text-body-sm text-teal-700 mt-1 flex items-center gap-1">
                        <Icon name="event_available" className="text-[14px]" /> Cita: {formatAppointment(r.scheduledAt)}
                      </p>
                    )}
                    {r.detailText && (
                      <p className="font-body-sm text-body-sm text-purple-700 mt-1">Otro: {r.detailText}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded font-label-sm text-label-sm border ${
                    variant === 'success' ? 'bg-secondary/10 text-secondary border-secondary/20' :
                    variant === 'warning' ? 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20' :
                    variant === 'error' ? 'bg-error/10 text-error border-error/20' :
                    variant === 'primary' ? 'bg-primary/10 text-primary border-primary/20' :
                    variant === 'teal' ? 'bg-teal-100 text-teal-700 border-teal-200' :
                    variant === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                    'bg-outline/10 text-on-surface-variant border-outline/20'
                  }`}>{disposition?.label}</span>
                </div>
                <div className="h-[1px] bg-outline-variant w-full my-1" />
                <div className="flex justify-between items-center pl-xs">
                  {editable ? (
                    <>
                      <span className="font-body-sm text-body-sm text-tertiary-container flex items-center gap-1">
                        <Icon name="timer" className="text-[14px]" /> {minsLeft} min restantes
                      </span>
                      <button
                        onClick={() => {
                          const updated = window.prompt('Editar notas de la llamada:', r.notes);
                          if (updated !== null && updated !== r.notes) {
                            updateReport(r.id, { notes: updated }, [{ field: 'notes', before: r.notes, after: updated }]);
                          }
                        }}
                        className="font-label-md text-label-md text-primary bg-surface-container-low hover:bg-surface-container transition-colors px-4 py-1.5 rounded border border-primary/20 flex items-center gap-1"
                      >
                        <Icon name="edit" className="text-[16px]" /> Editar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-body-sm text-body-sm text-outline flex items-center gap-1">
                        <Icon name="lock" className="text-[14px]" /> Solo supervisor
                      </span>
                      <button disabled className="font-label-md text-label-md text-outline bg-transparent px-4 py-1.5 rounded border border-outline-variant cursor-not-allowed">
                        Ver detalle
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-center font-body-md text-body-md text-on-surface-variant py-xl">Aún no hay reportes en este rango.</p>}
        </div>
      </main>
      <BottomTabBar items={agentTabs} active="/mobile/agente/mis-reportes" />
    </div>
  );
}
