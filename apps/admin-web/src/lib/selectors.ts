import type { CallReport } from '@callreport/shared';
import type { useStore } from '../store/AppStore';

type AppData = ReturnType<typeof useStore>['state'];

export function dispositionById(state: AppData, id: string) {
  return state.dispositions.find((d) => d.id === id);
}
export function campaignById(state: AppData, id: string) {
  return state.campaigns.find((c) => c.id === id);
}
export function tenantById(state: AppData, id: string) {
  return state.tenants.find((t) => t.id === id);
}
export function userById(state: AppData, id: string) {
  return state.users.find((u) => u.id === id);
}

export function isPendingFollowup(state: AppData, report: CallReport): boolean {
  const d = dispositionById(state, report.dispositionId);
  return !!d?.requiresFollowup && !report.followupResolvedAt;
}

export function reportsForTenant(state: AppData, tenantId: string): CallReport[] {
  return state.reports.filter((r) => r.tenantId === tenantId);
}

export function pendingFollowups(state: AppData, tenantId?: string): CallReport[] {
  return state.reports.filter((r) => (tenantId ? r.tenantId === tenantId : true) && isPendingFollowup(state, r));
}

export function reportsToday(reports: CallReport[]): CallReport[] {
  const today = new Date();
  return reports.filter((r) => {
    const d = new Date(r.createdAt);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  });
}

export function dispositionSlug(state: AppData, report: CallReport): 'venta' | 'consulta' | 'pendiente' | 'no-interesado' | undefined {
  const d = dispositionById(state, report.dispositionId);
  if (!d) return undefined;
  if (d.label.includes('Venta')) return 'venta';
  if (d.label.includes('Consulta')) return 'consulta';
  if (d.label.includes('Pendiente')) return 'pendiente';
  return 'no-interesado';
}

export function dispositionPillVariant(color?: string): 'success' | 'warning' | 'error' | 'neutral' | 'primary' {
  switch (color) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'primary':
      return 'primary';
    default:
      return 'neutral';
  }
}
