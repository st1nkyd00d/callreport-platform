// Tipos locales del flujo del agente (Fase 4). Mismo criterio que
// session.ts: cada app del monorepo duplica los tipos que necesita en
// vez de importar @callreport/shared (Metro no está wireado para
// paquetes cross-workspace todavía -- ver comentario en session.ts).

export interface AgentCampaign {
  id: string;
  name: string;
  tenant: { name: string };
}

export type DispositionColor =
  | 'success'
  | 'warning'
  | 'error'
  | 'primary'
  | 'teal'
  | 'purple'
  | 'neutral';

export interface Disposition {
  id: string;
  campaignId: string;
  label: string;
  code: string | null;
  sortOrder: number;
  requiresFollowup: boolean;
  requiresDetail: boolean;
  requiresSchedule: boolean;
  isActive: boolean;
  color: DispositionColor | null;
  icon: string | null;
}

export interface AgentReport {
  id: string;
  campaignId: string;
  dispositionId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  notes: string | null;
  scheduledAt: string | null;
  detailText: string | null;
  createdAt: string;
  updatedAt: string;
  disposition: Disposition;
  campaign: { id: string; name: string };
}

export interface Shift {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  closedBy: string | null;
  reportsCount?: number;
}

export interface CreateReportInput {
  campaignId: string;
  dispositionId: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  scheduledAt?: string;
  detailText?: string;
}

export type UpdateReportInput = Partial<Omit<CreateReportInput, 'campaignId'>>;

// Ningún endpoint expone hoy edit_window_minutes por reporte al agente
// (Tenant no es visible fuera de admin-web/staff) -- se usa el default
// del schema (Tenant.editWindowMinutes) solo para la cuenta regresiva en
// pantalla. Es una aproximación de UI: el servidor sigue siendo la única
// fuente de verdad (PATCH /reports/:id devuelve 403 si la ventana real,
// configurada por tenant, ya venció).
export const DEFAULT_EDIT_WINDOW_MINUTES = 30;
