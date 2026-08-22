import { useEffect, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { useStore } from '../../../store/AppStore';
import { agentTabs } from '../../../lib/tabs';
import { openShiftFor, reportsInShift, shiftsForUser } from '../../../lib/selectors';
import { formatDateLong, formatDuration, formatTime } from '../../../lib/format';

export function TurnoPage() {
  const { state, currentUser, clockIn, clockOut } = useStore();
  const [now, setNow] = useState(() => Date.now());

  const openShift = currentUser ? openShiftFor(state, currentUser.id) : undefined;

  useEffect(() => {
    if (!openShift) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openShift]);

  if (!currentUser) {
    return <div className="p-lg font-body-md text-body-md text-on-surface-variant">Selecciona un usuario agente en el modo demo.</div>;
  }

  const elapsedMs = openShift ? now - new Date(openShift.startedAt).getTime() : 0;
  const reportsThisShift = openShift ? reportsInShift(state, openShift.id).length : 0;

  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekShifts = shiftsForUser(state, currentUser.id)
    .filter((s) => s.startedAt >= weekAgo)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const weekTotalMs = weekShifts.reduce((sum, s) => {
    const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
    return sum + Math.max(0, end - new Date(s.startedAt).getTime());
  }, 0);

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="Turno" />
      <main className="flex-1 overflow-y-auto hide-scrollbar px-md py-lg pb-24 flex flex-col gap-lg">
        <section
          className={`rounded-xl border p-lg flex flex-col items-center gap-md text-center shadow-sm ${
            openShift ? 'bg-secondary/5 border-secondary/30' : 'bg-surface-container-lowest border-outline-variant'
          }`}
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${openShift ? 'bg-secondary/15 text-secondary' : 'bg-surface-container text-on-surface-variant'}`}>
            <Icon name="punch_clock" filled className="text-[32px]" />
          </div>
          {openShift ? (
            <>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">En turno desde</p>
                <p className="font-headline-sm text-headline-sm text-on-surface">{formatTime(openShift.startedAt)}</p>
              </div>
              <p className="font-headline-lg-mobile text-headline-lg-mobile text-secondary tabular-nums">{formatDuration(elapsedMs)}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {reportsThisShift} reporte{reportsThisShift === 1 ? '' : 's'} en este turno
              </p>
              <button
                onClick={clockOut}
                className="w-full bg-error text-on-error font-label-md text-label-md rounded-lg py-3 flex items-center justify-center gap-2 shadow-sm active:opacity-80 transition-opacity"
              >
                <Icon name="stop_circle" /> Finalizar turno
              </button>
            </>
          ) : (
            <>
              <p className="font-body-md text-body-md text-on-surface-variant">No has iniciado turno. Inicia tu turno para poder registrar llamadas.</p>
              <button
                onClick={clockIn}
                className="w-full bg-primary text-on-primary font-label-md text-label-md rounded-lg py-3 flex items-center justify-center gap-2 shadow-sm active:opacity-80 transition-opacity"
              >
                <Icon name="play_circle" /> Iniciar turno
              </button>
            </>
          )}
        </section>

        <section>
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase mb-sm px-1">Esta semana</h2>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden divide-y divide-outline-variant">
            {weekShifts.map((s) => {
              const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
              const durationMs = Math.max(0, end - new Date(s.startedAt).getTime());
              return (
                <div key={s.id} className="p-sm flex items-center justify-between">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">{formatDateLong(s.startedAt)}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {formatTime(s.startedAt)} – {s.endedAt ? formatTime(s.endedAt) : 'en curso'}
                      {s.closedBy && ' · cerrado por supervisor'}
                    </p>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface tabular-nums">{formatDuration(durationMs)}</span>
                </div>
              );
            })}
            {weekShifts.length === 0 && (
              <p className="p-md text-center font-body-md text-body-md text-on-surface-variant">Sin turnos esta semana.</p>
            )}
          </div>
          <div className="flex justify-between items-center px-2 mt-sm">
            <span className="font-label-md text-label-md text-on-surface-variant">Total semana</span>
            <span className="font-headline-sm text-headline-sm text-primary">{formatDuration(weekTotalMs)}</span>
          </div>
        </section>
      </main>
      <BottomTabBar items={agentTabs} active="/mobile/agente/turno" />
    </div>
  );
}
