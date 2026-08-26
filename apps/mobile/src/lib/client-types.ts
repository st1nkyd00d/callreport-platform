// Tipos locales del dashboard del cliente (Fase 5). Mismo criterio de
// duplicación que agent-types.ts (Metro no tiene wireado
// @callreport/shared todavía).

import type { Disposition } from './agent-types';

export type { Disposition } from './agent-types';

export interface ClientCampaign {
  id: string;
  name: string;
  tenant: { name: string };
}

export interface ClientReport {
  id: string;
  campaignId: string;
  dispositionId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  notes: string | null;
  scheduledAt: string | null;
  detailText: string | null;
  followupResolvedAt: string | null;
  followupResolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  disposition: Disposition;
  campaign: { id: string; name: string };
  agent: { id: string; fullName: string };
}

export interface ReportsPage {
  items: ClientReport[];
  nextCursor: string | null;
}

// Cola de seguimientos (plan.md Fase 6).
export type FollowupStatus = 'pending' | 'resolved';

export interface FollowupsCount {
  pending: number;
}

export interface DispositionSummary {
  dispositionId: string;
  code: string | null;
  label: string;
  color: string | null;
  count: number;
}

export interface ReportsSummary {
  total: number;
  byDisposition: DispositionSummary[];
}

// Rango de fecha del selector de chips del dashboard (plan.md Fase 5).
export type DateRangeKind = 'today' | 'week' | 'month' | 'custom';

export interface ReportFilters {
  from?: string;
  to?: string;
  dispositionIds?: string[];
}
