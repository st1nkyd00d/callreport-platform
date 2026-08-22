import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AdminLayout } from '../../components/AdminLayout';
import { KpiCard } from '../../components/KpiCard';
import { useStore } from '../../store/AppStore';
import { activeHoursFor, agentsOnShift, pendingFollowups } from '../../lib/selectors';

const COLOR_HEX: Record<string, string> = {
  success: '#006c49',
  warning: '#805000',
  error: '#ba1a1a',
  primary: '#24389c',
  neutral: '#757684',
  purple: '#7c3aed',
  teal: '#0d9488',
};

export function MetricasPage() {
  const { state } = useStore();
  const { tenants, reports, users, dispositions } = state;

  const agents = users.filter((u) => u.role === 'agent');
  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const pending = pendingFollowups(state).length;
  const onShiftCount = agentsOnShift(state).length;

  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);

  const byAgent = useMemo(
    () =>
      agents.map((agent) => {
        const agentReports = reports.filter((r) => r.agentId === agent.id);
        const ventas = agentReports.filter((r) => dispositions.find((d) => d.id === r.dispositionId)?.code === 'venta').length;
        const seguimientos = agentReports.filter((r) => dispositions.find((d) => d.id === r.dispositionId)?.requiresFollowup).length;
        const activeHours = activeHoursFor(state, agent.id, thirtyDaysAgo);
        return {
          name: agent.fullName.split(' ')[0] + ' ' + (agent.fullName.split(' ')[1]?.[0] ?? ''),
          fullName: agent.fullName,
          reportes: agentReports.length,
          promHora: activeHours > 0 ? +(agentReports.length / activeHours).toFixed(1) : 0,
          ventas,
          seguimientos,
        };
      }),
    [agents, reports, dispositions, state, thirtyDaysAgo],
  );

  const dailyVolume = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, label: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }), count: 0 });
    }
    for (const r of reports) {
      const key = r.createdAt.slice(0, 10);
      const bucket = days.find((d) => d.date === key);
      if (bucket) bucket.count += 1;
    }
    return days;
  }, [reports]);

  const distribution = useMemo(() => {
    const byCode = new Map<string, { name: string; value: number; color?: string }>();
    for (const r of reports) {
      const d = dispositions.find((x) => x.id === r.dispositionId);
      if (!d) continue;
      const key = d.code ?? d.label;
      const existing = byCode.get(key);
      if (existing) existing.value += 1;
      else byCode.set(key, { name: d.label, value: 1, color: d.color });
    }
    return Array.from(byCode.values());
  }, [reports, dispositions]);

  const avgPerAgentHour = byAgent.length ? (byAgent.reduce((s, a) => s + a.promHora, 0) / byAgent.length).toFixed(1) : '0.0';

  return (
    <AdminLayout title="Dashboard de Métricas">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-gutter">
        <KpiCard label="Reportes totales" value={reports.length.toLocaleString('es-ES')} icon="assessment" trend="Histórico del seed" trendTone="up" />
        <KpiCard label="Promedio por agente/hora" value={avgPerAgentHour} icon="speed" trend="Últimos 30 días en turno" trendTone="neutral" />
        <KpiCard label="Seguimientos pendientes" value={pending} icon="pending_actions" trend="Requiere atención" trendTone="warning" accent="warning" />
        <KpiCard label="Clientes activos" value={activeTenants} icon="business_center" trend={`de ${tenants.length} totales`} trendTone="up" />
        <KpiCard label="Agentes en turno" value={onShiftCount} icon="punch_clock" trend="Ahora mismo" trendTone="up" />
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
          <h2 className="font-label-md text-label-md text-on-surface mb-md">Volumen diario (14 días)</h2>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyVolume} margin={{ left: -20 }}>
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
          <h2 className="font-label-md text-label-md text-on-surface mb-md w-full text-left">Distribución de tipificaciones</h2>
          <div className="w-full" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {distribution.map((entry) => (
                    <Cell key={entry.name} fill={COLOR_HEX[entry.color ?? 'neutral'] ?? COLOR_HEX.neutral} />
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
                  <div className="w-3 h-3 rounded-full" style={{ background: COLOR_HEX[d.color ?? 'neutral'] ?? COLOR_HEX.neutral }} />
                  <span className="font-body-sm text-on-surface">{d.name}</span>
                </div>
                <span className="font-label-sm">{Math.round((d.value / reports.length) * 100)}%</span>
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
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200">{a.seguimientos}</span>
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
