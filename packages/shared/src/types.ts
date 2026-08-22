export type Role = 'super_admin' | 'supervisor' | 'agent' | 'client_user';

export type TenantStatus = 'active' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  editWindowMinutes: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'active' | 'inactive' | 'blocked';
  tenantId?: string; // solo para client_user
  lastAccessAt?: string;
}

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  status: 'active' | 'paused';
  agentIds: string[];
}

// Slug estable de tipificación. Fuente única en constants.ts
// (DEFAULT_DISPOSITIONS) — no comparar por label en español en el frontend.
export type DispositionCode =
  | 'venta'
  | 'cita'
  | 'consulta'
  | 'mensaje'
  | 'seguimiento'
  | 'reclamo'
  | 'no_interesado'
  | 'otro';

export interface Disposition {
  id: string;
  campaignId: string;
  label: string;
  code?: DispositionCode;
  sortOrder: number;
  requiresFollowup: boolean;
  requiresDetail: boolean;
  requiresSchedule: boolean;
  isActive: boolean;
  icon?: string;
  color?: 'success' | 'warning' | 'error' | 'neutral' | 'primary' | 'purple' | 'teal';
}

export interface CallReport {
  id: string;
  tenantId: string;
  campaignId: string;
  agentId: string;
  dispositionId: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  followupResolvedAt?: string;
  followupResolvedBy?: string;
  durationSeconds?: number;
  // Turno del agente al que pertenece el reporte. Ver Shift — la política
  // RLS de INSERT exige un turno abierto propio para el rol `agent`.
  shiftId?: string;
  scheduledAt?: string; // fecha/hora de la cita, cuando la disposition es requiresSchedule
  detailText?: string; // detalle obligatorio cuando la disposition es requiresDetail (p.ej. "Otro")
}

// Registro de jornada de un agente (clock in/out). Sin tenantId: es
// información laboral interna del call center, no de una empresa cliente.
export interface Shift {
  id: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  closedBy?: string; // supervisor que cerró un turno olvidado
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'resolve_followup'
  | 'suspend'
  | 'delete'
  | 'clock_in'
  | 'clock_out';

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  diff?: { field: string; before: unknown; after: unknown }[];
  ipAddress: string;
  createdAt: string;
}
