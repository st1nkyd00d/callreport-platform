import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminLayout } from '../../components/AdminLayout';
import { KpiCard } from '../../components/KpiCard';
import { useAgentMetrics, useOverviewMetrics } from '../../api/metrics';
import type { DateRange } from '../../api/metrics';

const COLOR_HEX: Record<string, string> = {
  success: '#006c49',
  warning: '#805000',
  error: '#ba1a1a',
  primary: '#24389c',
  neutral: '#757684',
  purple: '#7c3aed',
  teal: '#0d9488',
};

type RangeKind = 7 | 30 | 90 | 'custom';
const RANGE_OPTIONS: { key: RangeKind; label: string }[] = [
  { key: 7, label: '7 días' },
  { key: 30, label: '30 días' },
  { key: 90, label: '90 días' },
  { key: 'custom', label: 'Personalizado' },
];

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
function startOfDay(dateInput: string): Date {
  return new Date(`${dateInput}T00:00:00`);
}
function endOfDay(dateInput: string): Date {
  return new Date(`${dateInput}T23:59:59.999`);
}

// Genera la serie continua de días entre from/to -- el backend solo
// devuelve los días con al menos un reporte (GROUP BY), así que sin esto
// el gráfico de línea saltearía los días en cero en vez de mostrar el
// hueco.
function buildDailySeries(
  from: Date,
  to: Date,
  byDay: { date: string; count: number }[],
): { date: string; label: string; count: number }[] {
  const countByDate = new Map(byDay.map((d) => [d.date, d.count]));
  const days: { date: string; label: string; count: number }[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = toDateInput(cursor);
    days.push({
      date: key,
      label: cursor.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
      count: countByDate.get(key) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Fase 6 (plan.md): página "Métricas" con Recharts (barras por agente,
// línea de volumen diario, dona de tipificaciones, tabla comparativa) y
// selector de rango -- ahora sobre GET /admin/metrics/{agents,overview}
// reales en vez del AppStore mock.
export function MetricasPage() {
  const [rangeKind, setRangeKind] = useState<RangeKind>(30);
  const [customFrom, setCustomFrom] = useState(() => toDateInput(daysAgo(30)));
  const [customTo, setCustomTo] = useState(() => toDateInput(new Date()));

  const range: DateRange = useMemo(() => {
    if (rangeKind === 'custom') {
      return { from: startOfDay(customFrom).toISOString(), to: endOfDay(customTo).toISOString() };
    }
    return { from: daysAgo(rangeKind).toISOString(), to: new Date().toISOString() };
  }, [rangeKind, customFrom, customTo]);

  const { data: agentMetrics, isLoading: agentsLoading } = useAgentMetrics(range);
  const { data: overview, isLoading: overviewLoading } = useOverviewMetrics(range);

  const byAgent = useMemo(
    () =>
      (agentMetrics ?? []).map((a) => {
        const parts = a.fullName.split(' ');
        const ventas = a.byDisposition
          .filter((d) => d.code === 'venta')
          .reduce((s, d) => s + d.count, 0);
        const seguimientos = a.byDisposition
          .filter((d) => d.requiresFollowup)
          .reduce((s, d) => s + d.count, 0);
        return {
          name: parts[0] + ' ' + (parts[1]?.[0] ?? ''),
          fullName: a.fullName,
          reportes: a.total,
          promHora: a.perActiveHour,
          ventas,
          seguimientos,
        };
      }),
    [agentMetrics],
  );

  const dailySeries = useMemo(
    () => buildDailySeries(new Date(range.from), new Date(range.to), overview?.byDay ?? []),
    [range, overview],
  );

  // Sin endpoint propio de distribución por tipificación a nivel overview
  // (plan.md Fase 6 solo pide "volumen por día, por tenant y por
  // campaña") -- se deriva sumando byDisposition entre los agentes
  // activos devueltos por /admin/metrics/agents, que ya cubre el mismo
  // rango. Simplificación aceptada: un reporte de un agente hoy inactivo
  // (fuera del alcance de esta fase, no hay ninguno en el seed) no
  // aparecería acá aunque sí cuente en totalReports.
  const distribution = useMemo(() => {
    const byCode = new Map<string, { name: string; value: number; color: string | null }>();
    for (const agent of agentMetrics ?? []) {
      for (const d of agent.byDisposition) {
        const key = d.code ?? d.label;
        const existing = byCode.get(key);
        if (existing) existing.value += d.count;
        else byCode.set(key, { name: d.label, value: d.count, color: d.color });
      }
    }
    return Array.from(byCode.values());
  }, [agentMetrics]);

  const totalReports = overview?.totalReports ?? 0;
  const avgPerAgentHour = byAgent.length
    ? (byAgent.reduce((s, a) => s + a.promHora, 0) / byAgent.length).toFixed(1)
    : '0.0';

  const loading = agentsLoading || overviewLoading;

  return (
    <AdminLayout title="Dashboard de Métricas">
      <div className="flex flex-wrap gap-xs">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setRangeKind(opt.key)}
            className={`px-md py-xs rounded-full font-label-sm text-label-sm border transition-colors ${
              rangeKind === opt.key
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {rangeKind === 'custom' && (
          <div className="flex items-center gap-xs">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-outline-variant rounded px-sm py-xs font-body-sm text-body-sm bg-surface-container-lowest"
            />
            <span className="text-on-surface-variant">–</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={toDateInput(new Date())}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border border-outline-variant rounded px-sm py-xs font-body-sm text-body-sm bg-surface-container-lowest"
            />
          </div>
        )}
      </div>

      {loading && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Cargando métricas…</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-gutter">
        <KpiCard
          label="Reportes totales"
          value={totalReports.toLocaleString('es-ES')}
          icon="assessment"
          trend="En el rango seleccionado"
          trendTone="up"
        />
        <KpiCard
          label="Promedio por agente/hora"
          value={avgPerAgentHour}
          icon="speed"
          trend="En el rango seleccionado"
          trendTone="neutral"
        />
        <KpiCard
          label="Seguimientos pendientes"
          value={overview?.pendingFollowups ?? 0}
          icon="pending_actions"
          trend="Requiere atención"
          trendTone="warning"
          accent="warning"
        />
        <KpiCard
          label="Clientes activos"
          value={overview?.activeTenants ?? 0}
          icon="business_center"
          trend={`${overview?.byTenant.length ?? 0} con reportes en el rango`}
          trendTone="up"
        />
        <KpiCard
          label="Agentes en turno"
          value={overview?.agentsOnShift ?? 0}
          icon="punch_clock"
          trend="Ahora mismo"
          trendTone="up"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm p-md h-[340px] flex flex-col">
          <h2 className="font-label-md text-label-md text-on-surface mb-md">Reportes por agente</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byAgent} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e4e7" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="reportes" fill="#3f51b5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm p-md h-[340px] flex flex-col">
          <h2 className="font-label-md text-label-md text-on-surface mb-md">Volumen diario</h2>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailySeries} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e4e7" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#24389c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div className="lg:col-span-1 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm p-md flex flex-col">
          <h2 className="font-label-md text-label-md text-on-surface mb-md w-full text-left">
            Distribución de tipificaciones
          </h2>
          <div className="w-full" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {distribution.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={COLOR_HEX[entry.color ?? 'neutral'] ?? COLOR_HEX.neutral}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full mt-md space-y-sm">
            {distribution.map((d) => (
              <div key={d.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-xs">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: COLOR_HEX[d.color ?? 'neutral'] ?? COLOR_HEX.neutral }}
                  />
                  <span className="font-body-sm text-on-surface">{d.name}</span>
                </div>
                <span className="font-label-sm">
                  {totalReports > 0 ? Math.round((d.value / totalReports) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="p-md border-b border-outline-variant bg-surface">
            <h2 className="font-label-md text-label-md text-on-surface">Productividad por agente</h2>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface border-b border-outline-variant">
                <tr>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant">Agente</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Reportes</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Prom./hora</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Ventas</th>
                  <th className="py-sm px-md font-label-sm text-label-sm text-on-surface-variant text-right">Seguimientos</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface divide-y divide-outline-variant/50">
                {byAgent
                  .slice()
                  .sort((a, b) => b.reportes - a.reportes)
                  .map((a) => (
                    <tr key={a.fullName} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-sm px-md font-medium">{a.fullName}</td>
                      <td className="py-sm px-md text-right">{a.reportes}</td>
                      <td className="py-sm px-md text-right">{a.promHora}</td>
                      <td className="py-sm px-md text-right">{a.ventas}</td>
                      <td className="py-sm px-md text-right">
                        {a.seguimientos > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200">
                            {a.seguimientos}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
