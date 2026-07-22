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

export interface Disposition {
  id: string;
  campaignId: string;
  label: string;
  sortOrder: number;
  requiresFollowup: boolean;
  isActive: boolean;
  icon?: string;
  color?: 'success' | 'warning' | 'neutral' | 'primary';
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
}

export type AuditAction = 'create' | 'update' | 'resolve_followup' | 'suspend' | 'delete';

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
