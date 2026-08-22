import type { CallReport, Shift } from '@callreport/shared';
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

export function dispositionPillVariant(color?: string): 'success' | 'warning' | 'error' | 'neutral' | 'primary' | 'purple' | 'teal' {
  switch (color) {
    case 'success':
    case 'warning':
    case 'error':
    case 'primary':
    case 'purple':
    case 'teal':
      return color;
    default:
      return 'neutral';
  }
}

// --- Turnos -----------------------------------------------------------

export function shiftsForUser(state: AppData, userId: string): Shift[] {
  return state.shifts.filter((s) => s.userId === userId);
}

export function openShiftFor(state: AppData, userId: string): Shift | undefined {
  return state.shifts.find((s) => s.userId === userId && !s.endedAt);
}

export function agentsOnShift(state: AppData) {
  const openUserIds = new Set(state.shifts.filter((s) => !s.endedAt).map((s) => s.userId));
  return state.users.filter((u) => u.role === 'agent' && openUserIds.has(u.id));
}

export function reportsInShift(state: AppData, shiftId: string): CallReport[] {
  return state.reports.filter((r) => r.shiftId === shiftId);
}

// Horas activas (suma de duración de turnos, contando el turno en curso
// hasta "ahora") de un usuario desde una fecha ISO dada.
export function activeHoursFor(state: AppData, userId: string, sinceIso: string): number {
  const since = new Date(sinceIso).getTime();
  const now = Date.now();
  return shiftsForUser(state, userId)
    .filter((s) => new Date(s.startedAt).getTime() >= since)
    .reduce((sum, s) => {
      const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
      return sum + Math.max(0, end - new Date(s.startedAt).getTime()) / 3_600_000;
    }, 0);
}

export function upcomingAppointments(state: AppData, tenantId?: string): CallReport[] {
  const now = Date.now();
  return state.reports
    .filter((r) => (tenantId ? r.tenantId === tenantId : true) && r.scheduledAt && new Date(r.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
}
