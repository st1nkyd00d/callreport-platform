import { useMemo, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { Chip } from '../../../components/Chip';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { ReportCard } from '../../../components/ReportCard';
import { useStore } from '../../../store/AppStore';
import { clientTabsBase } from '../../../lib/tabs';
import { dispositionById, pendingFollowups, upcomingAppointments } from '../../../lib/selectors';
import { formatAppointment } from '../../../lib/format';

const rangeChips: { label: string; days: number }[] = [
  { label: 'Hoy', days: 1 },
  { label: 'Semana', days: 7 },
  { label: 'Mes', days: 30 },
];

const PAGE_SIZE = 25;

export function DashboardPage() {
  const { state, currentUser, simulateIncomingReport } = useStore();
  const [range, setRange] = useState(0);
  const [dispositionFilter, setDispositionFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [justArrivedId, setJustArrivedId] = useState<string | null>(null);

  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;
  const pending = tenant ? pendingFollowups(state, tenant.id) : [];
  const upcoming = tenant ? upcomingAppointments(state, tenant.id).slice(0, 5) : [];

  const tenantDispositions = useMemo(() => {
    if (!tenant) return [];
    const list = state.dispositions.filter((d) => state.campaigns.some((c) => c.id === d.campaignId && c.tenantId === tenant.id));
    const seen = new Map<string, (typeof list)[number]>();
    for (const d of list) {
      const key = d.code ?? d.id;
      if (!seen.has(key)) seen.set(key, d);
    }
    return Array.from(seen.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [state.dispositions, state.campaigns, tenant]);

  const filteredReports = useMemo(() => {
    if (!tenant) return [];
    const cutoff = Date.now() - rangeChips[range].days * 24 * 60 * 60 * 1000;
    return state.reports.filter((r) => {
      if (r.tenantId !== tenant.id) return false;
      if (new Date(r.createdAt).getTime() < cutoff) return false;
      if (dispositionFilter) {
        const d = dispositionById(state, r.dispositionId);
        if ((d?.code ?? d?.id) !== dispositionFilter) return false;
      }
      return true;
    });
  }, [state, tenant, range, dispositionFilter]);

  const counts = useMemo(() => {
    const byCode: Record<string, number> = {};
    for (const r of filteredReports) {
      const d = dispositionById(state, r.dispositionId);
      const code = d?.code ?? 'otro';
      byCode[code] = (byCode[code] ?? 0) + 1;
    }
    const ventas = byCode.venta ?? 0;
    const citas = byCode.cita ?? 0;
    const seguimientos = (byCode.seguimiento ?? 0) + (byCode.mensaje ?? 0) + (byCode.reclamo ?? 0);
    const otros = Math.max(0, filteredReports.length - ventas - citas - seguimientos);
    return { total: filteredReports.length, ventas, citas, seguimientos, otros };
  }, [filteredReports, state]);

  const feed = filteredReports.slice(0, visibleCount);

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
        {/* Nota: overflow-x-auto va en un div interno, no directamente en el
            <section> (flex item de este main flex-col) -- si no, Chromium
            colapsa la altura del item a 0 por la regla de min-height:auto
            con overflow no-visible en contenedores flex. */}
        <section className="flex flex-col">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
            {rangeChips.map((c, i) => (
              <Chip key={c.label} label={c.label} active={range === i} onClick={() => setRange(i)} />
            ))}
          </div>
        </section>

        <section className="flex flex-col">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
            <Chip label="Todas" active={dispositionFilter === null} onClick={() => setDispositionFilter(null)} />
            {tenantDispositions.map((d) => (
              <Chip
                key={d.code ?? d.id}
                label={d.label}
                active={dispositionFilter === (d.code ?? d.id)}
                onClick={() => setDispositionFilter(d.code ?? d.id)}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col">
          <div className="flex gap-sm overflow-x-auto hide-scrollbar py-1">
            {[
              { label: 'Total', value: counts.total, icon: 'call', color: 'text-primary' },
              { label: 'Ventas', value: counts.ventas, icon: 'monetization_on', color: 'text-secondary' },
              { label: 'Citas', value: counts.citas, icon: 'event_available', color: 'text-teal-600' },
              { label: 'Seguimientos', value: counts.seguimientos, icon: 'history_toggle_off', color: 'text-tertiary-container' },
              { label: 'Otros', value: counts.otros, icon: 'more_horiz', color: 'text-on-surface-variant' },
            ].map((kpi) => (
              <div key={kpi.label} className="min-w-[104px] bg-surface-container-lowest border border-outline-variant rounded-lg p-sm flex flex-col justify-between shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{kpi.label}</span>
                  <Icon name={kpi.icon} className={`${kpi.color} text-[16px]`} />
                </div>
                <span className={`font-headline-lg-mobile text-headline-lg-mobile ${kpi.color}`}>{kpi.value}</span>
              </div>
            ))}
          </div>
        </section>

        {upcoming.length > 0 && (
          <section className="flex flex-col gap-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Próximas citas</h2>
            <div className="flex gap-sm overflow-x-auto hide-scrollbar pb-1">
              {upcoming.map((r) => (
                <div key={r.id} className="min-w-[180px] bg-teal-50 border border-teal-200 rounded-xl p-sm flex flex-col gap-1 shrink-0">
                  <span className="font-label-sm text-label-sm text-teal-700 flex items-center gap-1">
                    <Icon name="event_available" className="text-[14px]" /> {formatAppointment(r.scheduledAt!)}
                  </span>
                  <span className="font-label-md text-label-md text-on-surface truncate">{r.contactName}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">{state.campaigns.find((c) => c.id === r.campaignId)?.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-sm">
          <div className="flex items-center justify-between mt-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Reportes recientes</h2>
            <button onClick={handleSimulate} className="font-label-sm text-label-sm text-primary flex items-center gap-1">
              <Icon name="bolt" className="text-[16px]" /> Simular llamada
            </button>
          </div>
          <div className="flex flex-col gap-sm">
            {feed.map((r) => (
              <ReportCard key={r.id} reportId={r.id} highlighted={r.id === justArrivedId} />
            ))}
            {feed.length === 0 && (
              <p className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md text-center font-body-md text-body-md text-on-surface-variant">
                Aún no hay reportes en este rango.
              </p>
            )}
          </div>
          {filteredReports.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="w-full py-2 rounded-lg border border-outline-variant text-primary font-label-md text-label-md hover:bg-surface-container-low transition-colors"
            >
              Ver más
            </button>
          )}
        </section>
      </main>
      <BottomTabBar items={clientTabs} active="/mobile/cliente/dashboard" />
    </div>
  );
}
