import { useMemo, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { MobileTopBar } from '../../../components/MobileTopBar';
import { BottomTabBar } from '../../../components/BottomTabBar';
import { Toast } from '../../../components/Toast';
import { useStore } from '../../../store/AppStore';
import { dispositionById, pendingFollowups } from '../../../lib/selectors';
import { formatDateTime } from '../../../lib/format';

const clientTabsBase = [
  { to: '/mobile/cliente/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { to: '/mobile/cliente/seguimientos', label: 'Seguimientos', icon: 'history_toggle_off' },
  { to: '/mobile/cliente/exportar', label: 'Exportar', icon: 'download' },
  { to: '/mobile/perfil', label: 'Perfil', icon: 'person' },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function ExportarPage() {
  const { state, currentUser } = useStore();
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [dispositionFilter, setDispositionFilter] = useState('all');
  const [toast, setToast] = useState<string | null>(null);

  const tenant = currentUser?.tenantId ? state.tenants.find((t) => t.id === currentUser.tenantId) : undefined;
  const pending = tenant ? pendingFollowups(state, tenant.id) : [];
  const clientTabs = clientTabsBase.map((t) => (t.to.includes('seguimientos') ? { ...t, badge: pending.length } : t));

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

  const filtered = useMemo(() => {
    if (!tenant) return [];
    const fromTime = new Date(from + 'T00:00:00').getTime();
    const toTime = new Date(to + 'T23:59:59').getTime();
    return state.reports.filter((r) => {
      if (r.tenantId !== tenant.id) return false;
      const t = new Date(r.createdAt).getTime();
      if (t < fromTime || t > toTime) return false;
      if (dispositionFilter !== 'all') {
        const d = dispositionById(state, r.dispositionId);
        if ((d?.code ?? d?.id) !== dispositionFilter) return false;
      }
      return true;
    });
  }, [state, tenant, from, to, dispositionFilter]);

  function handleDownload() {
    if (!tenant) return;
    if (format === 'pdf') {
      setToast('Generación de PDF disponible en una fase posterior — usa CSV por ahora');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const header = ['ID', 'Fecha', 'Contacto', 'Teléfono', 'Campaña', 'Tipificación', 'Agente', 'Cita agendada', 'Detalle', 'Notas'];
    const rows = filtered.map((r) => {
      const campaign = state.campaigns.find((c) => c.id === r.campaignId);
      const disposition = dispositionById(state, r.dispositionId);
      const agent = state.users.find((u) => u.id === r.agentId);
      return [
        r.id, formatDateTime(r.createdAt), r.contactName, r.contactPhone, campaign?.name ?? '', disposition?.label ?? '', agent?.fullName ?? '',
        r.scheduledAt ? formatDateTime(r.scheduledAt) : '',
        r.detailText ?? '',
        (r.notes ?? '').replace(/\n/g, ' '),
      ];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `callreport_${tenant.name.replace(/\s+/g, '_').toLowerCase()}_${from}_a_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast(`${filtered.length} reportes descargados`);
    setTimeout(() => setToast(null), 2500);
  }

  if (!tenant) {
    return <div className="p-lg font-body-md text-body-md text-on-surface-variant">Selecciona un usuario cliente en el modo demo.</div>;
  }

  return (
    <div className="h-full flex flex-col relative">
      <MobileTopBar title="CallReport" />
      <main className="flex-1 overflow-y-auto hide-scrollbar px-md py-lg flex flex-col gap-lg pb-24">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-background mb-xs">Exportar reportes</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Configura y descarga tus datos</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col gap-md">
          <div className="grid grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md text-on-surface-variant">Desde</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-sm py-sm rounded-lg border border-outline-variant bg-surface-container-lowest text-on-background font-body-md text-body-md" />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md text-on-surface-variant">Hasta</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-sm py-sm rounded-lg border border-outline-variant bg-surface-container-lowest text-on-background font-body-md text-body-md" />
            </div>
          </div>
          <div className="flex flex-col gap-xs">
            <label className="font-label-md text-label-md text-on-surface-variant">Tipificación</label>
            <select value={dispositionFilter} onChange={(e) => setDispositionFilter(e.target.value)} className="w-full px-sm py-sm rounded-lg border border-outline-variant bg-surface-container-lowest text-on-background font-body-md text-body-md">
              <option value="all">Todas</option>
              {tenantDispositions.map((d) => (
                <option key={d.code ?? d.id} value={d.code ?? d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-xs pt-sm border-t border-outline-variant flex justify-between items-center">
            <span className="font-body-md text-body-md text-on-surface-variant">Registros a exportar</span>
            <span className="font-headline-sm text-headline-sm text-primary">{filtered.length} reportes</span>
          </div>
        </div>

        <div className="flex flex-col gap-sm">
          <h3 className="font-label-md text-label-md text-on-surface-variant mb-xs">Formato de archivo</h3>
          <div className="grid grid-cols-2 gap-md">
            <button
              onClick={() => setFormat('csv')}
              className={`border-2 rounded-xl p-md flex flex-col items-center justify-center gap-sm shadow-sm relative ${format === 'csv' ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest'}`}
            >
              <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center"><Icon name="table" className="text-[24px]" /></div>
              <span className="font-label-md text-label-md text-on-background">CSV / Excel</span>
              {format === 'csv' && <Icon name="check_circle" filled className="absolute top-sm right-sm text-primary text-[18px]" />}
            </button>
            <button
              onClick={() => setFormat('pdf')}
              className={`border-2 rounded-xl p-md flex flex-col items-center justify-center gap-sm shadow-sm relative ${format === 'pdf' ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest'}`}
            >
              <div className="w-12 h-12 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center"><Icon name="description" className="text-[24px]" /></div>
              <span className="font-label-md text-label-md text-on-background">PDF</span>
              {format === 'pdf' && <Icon name="check_circle" filled className="absolute top-sm right-sm text-primary text-[18px]" />}
            </button>
          </div>
        </div>

        <button onClick={handleDownload} className="w-full bg-primary text-on-primary font-label-md text-label-md py-[14px] rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-sm">
          <Icon name="share" className="text-[20px]" /> Descargar y compartir
        </button>
      </main>
      <BottomTabBar items={clientTabs} active="/mobile/cliente/exportar" />
      <Toast message={toast} position="top" />
    </div>
  );
}
