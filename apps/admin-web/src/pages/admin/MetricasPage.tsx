import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AdminLayout } from '../../components/AdminLayout';
import { KpiCard } from '../../components/KpiCard';
import { useStore } from '../../store/AppStore';
import { pendingFollowups } from '../../lib/selectors';

const DONUT_COLORS = ['#24389c', '#006c49', '#805000', '#757684'];

export function MetricasPage() {
  const { state } = useStore();
  const { tenants, reports, users, dispositions } = state;

  const agents = users.filter((u) => u.role === 'agent');
  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const pending = pendingFollowups(state).length;

  const byAgent = useMemo(
    () =>
      agents.map((agent) => {
        const agentReports = reports.filter((r) => r.agentId === agent.id);
        const ventas = agentReports.filter((r) => dispositions.find((d) => d.id === r.dispositionId)?.label === 'Venta Completada').length;
        const seguimientos = agentReports.filter((r) => dispositions.find((d) => d.id === r.dispositionId)?.requiresFollowup).length;
        return {
          name: agent.fullName.split(' ')[0] + ' ' + (agent.fullName.split(' ')[1]?.[0] ?? ''),
          fullName: agent.fullName,
          reportes: agentReports.length,
          promHora: agentReports.length ? +(agentReports.length / 22).toFixed(1) : 0,
          ventas,
          seguimientos,
        };
      }),
    [agents, reports, dispositions],
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
    const byLabel = new Map<string, number>();
    for (const r of reports) {
      const d = dispositions.find((x) => x.id === r.dispositionId);
      if (!d) continue;
      byLabel.set(d.label, (byLabel.get(d.label) ?? 0) + 1);
    }
    return Array.from(byLabel.entries()).map(([name, value]) => ({ name, value }));
  }, [reports, dispositions]);

  const avgPerAgentHour = byAgent.length ? (byAgent.reduce((s, a) => s + a.promHora, 0) / byAgent.length).toFixed(1) : '0.0';

  return (
    <AdminLayout title="Dashboard de Métricas">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <KpiCard label="Reportes totales" value={reports.length.toLocaleString('es-ES')} icon="assessment" trend="Histórico del seed" trendTone="up" />
        <KpiCard label="Promedio por agente/hora" value={avgPerAgentHour} icon="speed" trend="Estable" trendTone="neutral" />
        <KpiCard label="Seguimientos pendientes" value={pending} icon="pending_actions" trend="Requiere atención" trendTone="warning" accent="warning" />
        <KpiCard label="Clientes activos" value={activeTenants} icon="business_center" trend={`de ${tenants.length} totales`} trendTone="up" />
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
                  {distribution.map((entry, i) => (
                    <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full mt-md space-y-sm">
            {distribution.map((d, i) => (
              <div key={d.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-xs">
                  <div className="w-3 h-3 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
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
