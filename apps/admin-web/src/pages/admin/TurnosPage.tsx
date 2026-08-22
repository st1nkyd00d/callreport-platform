import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { useStore } from '../../store/AppStore';
import { reportsInShift } from '../../lib/selectors';
import { formatDateLong, formatDuration, formatTime, initials } from '../../lib/format';

const rangeOptions = [
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
];

export function TurnosPage() {
  const { state, forceCloseShift } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const openShifts = state.shifts.filter((s) => !s.endedAt);
  const cutoff = now - rangeOptions[range].days * 24 * 60 * 60 * 1000;
  const historyShifts = state.shifts
    .filter((s) => new Date(s.startedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  function agentName(userId: string) {
    return state.users.find((u) => u.id === userId)?.fullName ?? 'Agente';
  }

  return (
    <AdminLayout title="Turnos">
      <section className="space-y-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">En turno ahora</h2>
        {openShifts.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">Ningún agente tiene un turno abierto.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {openShifts.map((s) => {
              const elapsedMs = now - new Date(s.startedAt).getTime();
              const reportsCount = reportsInShift(state, s.id).length;
              return (
                <div key={s.id} className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm flex flex-col gap-sm">
                  <div className="flex items-center gap-sm">
                    <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center font-label-sm text-label-sm">
                      {initials(agentName(s.userId))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-label-md text-label-md text-on-surface truncate">{agentName(s.userId)}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">Desde {formatTime(s.startedAt)}</p>
                    </div>
                  </div>
                  <p className="font-headline-sm text-headline-sm text-secondary tabular-nums">{formatDuration(elapsedMs)}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {reportsCount} reporte{reportsCount === 1 ? '' : 's'} en este turno
                  </p>
                  <button
                    onClick={() => {
                      forceCloseShift(s.id);
                      setToast(`Turno de ${agentName(s.userId)} cerrado`);
                      setTimeout(() => setToast(null), 2000);
                    }}
                    className="mt-xs w-full py-2 rounded border border-error/30 text-error font-label-md text-label-md hover:bg-error/5 transition-colors flex items-center justify-center gap-2"
                  >
                    <Icon name="stop_circle" className="text-[18px]" /> Cerrar turno
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-md">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Historial</h2>
          <div className="flex bg-surface-container-high rounded-lg p-1">
            {rangeOptions.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRange(i)}
                className={`px-3 py-1 rounded-md font-label-sm text-label-sm transition-colors ${range === i ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface border-b border-outline-variant">
                <tr>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant">Agente</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant">Día</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant">Entrada</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant">Salida</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Horas</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Reportes</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Rep./hora</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface divide-y divide-outline-variant/50">
                {historyShifts.map((s) => {
                  const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
                  const hours = Math.max(0, end - new Date(s.startedAt).getTime()) / 3_600_000;
                  const reportsCount = reportsInShift(state, s.id).length;
                  return (
                    <tr key={s.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-sm px-md font-medium">{agentName(s.userId)}</td>
                      <td className="py-sm px-md">{formatDateLong(s.startedAt)}</td>
                      <td className="py-sm px-md">{formatTime(s.startedAt)}</td>
                      <td className="py-sm px-md">
                        {s.endedAt ? formatTime(s.endedAt) : <span className="text-secondary">en curso</span>}
                        {s.closedBy && <span className="ml-1 text-outline">· cerrado por supervisor</span>}
                      </td>
                      <td className="py-sm px-md text-right tabular-nums">{hours.toFixed(1)}h</td>
                      <td className="py-sm px-md text-right">{reportsCount}</td>
                      <td className="py-sm px-md text-right">{hours > 0 ? (reportsCount / hours).toFixed(1) : '0.0'}</td>
                    </tr>
                  );
                })}
                {historyShifts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-lg text-center text-on-surface-variant">
                      Sin turnos en este rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <Toast message={toast} />
    </AdminLayout>
  );
}
