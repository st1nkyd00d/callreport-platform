import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { AuditAction, AuditLog, CallReport, Campaign, Disposition, Tenant, User } from '@callreport/shared';
import { auditLogs as seedAuditLogs, campaigns as seedCampaigns, contactNamePool, dispositions as seedDispositions, randomPhone, reports as seedReports, tenants as seedTenants, users as seedUsers } from '../mocks/seed';

interface AppState {
  tenants: Tenant[];
  users: User[];
  campaigns: Campaign[];
  dispositions: Disposition[];
  reports: CallReport[];
  auditLogs: AuditLog[];
  session: {
    userId: string;
    agentCampaignId?: string;
  };
}

const initialState: AppState = {
  tenants: seedTenants,
  users: seedUsers,
  campaigns: seedCampaigns,
  dispositions: seedDispositions,
  reports: seedReports,
  auditLogs: seedAuditLogs,
  session: {
    userId: 'u-admin',
    agentCampaignId: 'c-acme-ventas',
  },
};

type Action =
  | { type: 'SWITCH_USER'; userId: string }
  | { type: 'SELECT_AGENT_CAMPAIGN'; campaignId: string }
  | { type: 'CREATE_TENANT'; tenant: Tenant; actorId: string }
  | { type: 'UPDATE_TENANT'; id: string; patch: Partial<Tenant>; actorId: string }
  | { type: 'CREATE_USER'; user: User; actorId: string }
  | { type: 'UPDATE_USER'; id: string; patch: Partial<User>; actorId: string }
  | { type: 'CREATE_CAMPAIGN'; campaign: Campaign; actorId: string }
  | { type: 'UPDATE_CAMPAIGN'; id: string; patch: Partial<Campaign>; actorId: string }
  | { type: 'TOGGLE_CAMPAIGN_AGENT'; campaignId: string; agentId: string; actorId: string }
  | { type: 'ADD_DISPOSITION'; disposition: Disposition; actorId: string }
  | { type: 'UPDATE_DISPOSITION'; id: string; patch: Partial<Disposition>; actorId: string }
  | { type: 'MOVE_DISPOSITION'; campaignId: string; id: string; direction: 'up' | 'down' }
  | { type: 'CREATE_REPORT'; report: CallReport; actorId: string }
  | { type: 'UPDATE_REPORT'; id: string; patch: Partial<CallReport>; actorId: string; diff?: AuditLog['diff'] }
  | { type: 'RESOLVE_FOLLOWUP'; id: string; actorId: string };

function audit(state: AppState, actorId: string, action: AuditAction, entityType: string, entityId: string, diff?: AuditLog['diff']): AuditLog {
  const actor = state.users.find((u) => u.id === actorId);
  return {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    userId: actorId,
    userEmail: actor?.email ?? 'sistema@callreport.demo',
    action,
    entityType,
    entityId,
    diff,
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SWITCH_USER': {
      const user = state.users.find((u) => u.id === action.userId);
      const firstCampaign = user ? state.campaigns.find((c) => c.agentIds.includes(user.id)) : undefined;
      return { ...state, session: { ...state.session, userId: action.userId, agentCampaignId: firstCampaign?.id ?? state.session.agentCampaignId } };
    }
    case 'SELECT_AGENT_CAMPAIGN':
      return { ...state, session: { ...state.session, agentCampaignId: action.campaignId } };

    case 'CREATE_TENANT':
      return {
        ...state,
        tenants: [...state.tenants, action.tenant],
        auditLogs: [audit(state, action.actorId, 'create', 'Tenant', action.tenant.id), ...state.auditLogs],
      };
    case 'UPDATE_TENANT':
      return {
        ...state,
        tenants: state.tenants.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
        auditLogs: [audit(state, action.actorId, 'update', 'Tenant', action.id, Object.entries(action.patch).map(([field, after]) => ({ field, before: undefined, after }))), ...state.auditLogs],
      };

    case 'CREATE_USER':
      return {
        ...state,
        users: [...state.users, action.user],
        auditLogs: [audit(state, action.actorId, 'create', 'User', action.user.id), ...state.auditLogs],
      };
    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)),
        auditLogs: [audit(state, action.actorId, 'update', 'User', action.id, Object.entries(action.patch).map(([field, after]) => ({ field, before: undefined, after }))), ...state.auditLogs],
      };

    case 'CREATE_CAMPAIGN':
      return {
        ...state,
        campaigns: [...state.campaigns, action.campaign],
        dispositions: [
          ...state.dispositions,
          { id: `d-${action.campaign.id}-venta`, campaignId: action.campaign.id, label: 'Venta Completada', sortOrder: 0, requiresFollowup: false, isActive: true, icon: 'check_circle', color: 'success' },
          { id: `d-${action.campaign.id}-consulta`, campaignId: action.campaign.id, label: 'Consulta Resuelta', sortOrder: 1, requiresFollowup: false, isActive: true, icon: 'support_agent', color: 'primary' },
          { id: `d-${action.campaign.id}-pendiente`, campaignId: action.campaign.id, label: 'Seguimiento Pendiente', sortOrder: 2, requiresFollowup: true, isActive: true, icon: 'schedule', color: 'warning' },
          { id: `d-${action.campaign.id}-no-interesado`, campaignId: action.campaign.id, label: 'No Interesado', sortOrder: 3, requiresFollowup: false, isActive: true, icon: 'do_not_disturb', color: 'neutral' },
        ],
        auditLogs: [audit(state, action.actorId, 'create', 'Campaign', action.campaign.id), ...state.auditLogs],
      };
    case 'UPDATE_CAMPAIGN':
      return {
        ...state,
        campaigns: state.campaigns.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
        auditLogs: [audit(state, action.actorId, 'update', 'Campaign', action.id, Object.entries(action.patch).map(([field, after]) => ({ field, before: undefined, after }))), ...state.auditLogs],
      };
    case 'TOGGLE_CAMPAIGN_AGENT': {
      const campaign = state.campaigns.find((c) => c.id === action.campaignId);
      if (!campaign) return state;
      const has = campaign.agentIds.includes(action.agentId);
      const agentIds = has ? campaign.agentIds.filter((id) => id !== action.agentId) : [...campaign.agentIds, action.agentId];
      return {
        ...state,
        campaigns: state.campaigns.map((c) => (c.id === action.campaignId ? { ...c, agentIds } : c)),
        auditLogs: [audit(state, action.actorId, 'update', 'Campaign', action.campaignId, [{ field: 'agentIds', before: has ? 'asignado' : 'no asignado', after: has ? 'no asignado' : 'asignado' }]), ...state.auditLogs],
      };
    }

    case 'ADD_DISPOSITION':
      return {
        ...state,
        dispositions: [...state.dispositions, action.disposition],
        auditLogs: [audit(state, action.actorId, 'create', 'Disposition', action.disposition.id), ...state.auditLogs],
      };
    case 'UPDATE_DISPOSITION':
      return {
        ...state,
        dispositions: state.dispositions.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
        auditLogs: [audit(state, action.actorId, 'update', 'Disposition', action.id, Object.entries(action.patch).map(([field, after]) => ({ field, before: undefined, after }))), ...state.auditLogs],
      };
    case 'MOVE_DISPOSITION': {
      const list = state.dispositions.filter((d) => d.campaignId === action.campaignId).sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = list.findIndex((d) => d.id === action.id);
      const swapWith = action.direction === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swapWith < 0 || swapWith >= list.length) return state;
      const a = list[idx];
      const b = list[swapWith];
      return {
        ...state,
        dispositions: state.dispositions.map((d) => {
          if (d.id === a.id) return { ...d, sortOrder: b.sortOrder };
          if (d.id === b.id) return { ...d, sortOrder: a.sortOrder };
          return d;
        }),
      };
    }

    case 'CREATE_REPORT':
      return {
        ...state,
        reports: [action.report, ...state.reports],
        auditLogs: [audit(state, action.actorId, 'create', 'CallReport', action.report.id), ...state.auditLogs],
      };
    case 'UPDATE_REPORT':
      return {
        ...state,
        reports: state.reports.map((r) => (r.id === action.id ? { ...r, ...action.patch, updatedAt: new Date().toISOString() } : r)),
        auditLogs: [audit(state, action.actorId, 'update', 'CallReport', action.id, action.diff), ...state.auditLogs],
      };
    case 'RESOLVE_FOLLOWUP':
      return {
        ...state,
        reports: state.reports.map((r) => (r.id === action.id ? { ...r, followupResolvedAt: new Date().toISOString(), followupResolvedBy: action.actorId, updatedAt: new Date().toISOString() } : r)),
        auditLogs: [audit(state, action.actorId, 'resolve_followup', 'CallReport', action.id), ...state.auditLogs],
      };

    default:
      return state;
  }
}

interface StoreApi {
  state: AppState;
  currentUser: User | undefined;
  switchUser: (userId: string) => void;
  selectAgentCampaign: (campaignId: string) => void;
  createTenant: (data: Omit<Tenant, 'id' | 'createdAt'>) => void;
  updateTenant: (id: string, patch: Partial<Tenant>) => void;
  createUser: (data: Omit<User, 'id'>) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  createCampaign: (data: Omit<Campaign, 'id' | 'agentIds'>) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  toggleCampaignAgent: (campaignId: string, agentId: string) => void;
  addDisposition: (campaignId: string, data: { label: string; requiresFollowup: boolean }) => void;
  updateDisposition: (id: string, patch: Partial<Disposition>) => void;
  moveDisposition: (campaignId: string, id: string, direction: 'up' | 'down') => void;
  createReport: (data: { campaignId: string; dispositionId: string; contactName: string; contactPhone: string; contactEmail?: string; notes: string }) => CallReport;
  updateReport: (id: string, patch: Partial<CallReport>, diff?: AuditLog['diff']) => void;
  resolveFollowup: (id: string) => void;
  simulateIncomingReport: (tenantId: string) => CallReport | undefined;
}

const StoreContext = createContext<StoreApi | null>(null);

let reportSeq = 9000;

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // VITE_API_MODE=real todavía no tiene cliente API que consumir (llega
  // en la Fase 3, ver plan.md). Por ahora el store siempre opera en modo
  // mock; esto solo deja avisado el modo a medias en vez de fallar en
  // silencio si alguien setea la variable antes de tiempo.
  if (import.meta.env.VITE_API_MODE === 'real') {
    console.warn(
      '[AppStore] VITE_API_MODE=real todavía no está implementado (Fase 3). Usando datos mock.',
    );
  }

  const [state, dispatch] = useReducer(reducer, initialState);
  const actorId = state.session.userId;

  const currentUser = useMemo(() => state.users.find((u) => u.id === actorId), [state.users, actorId]);

  const switchUser = useCallback((userId: string) => dispatch({ type: 'SWITCH_USER', userId }), []);
  const selectAgentCampaign = useCallback((campaignId: string) => dispatch({ type: 'SELECT_AGENT_CAMPAIGN', campaignId }), []);

  const createTenant = useCallback<StoreApi['createTenant']>((data) => {
    dispatch({ type: 'CREATE_TENANT', tenant: { ...data, id: `t-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString() }, actorId });
  }, [actorId]);
  const updateTenant = useCallback<StoreApi['updateTenant']>((id, patch) => dispatch({ type: 'UPDATE_TENANT', id, patch, actorId }), [actorId]);

  const createUser = useCallback<StoreApi['createUser']>((data) => {
    dispatch({ type: 'CREATE_USER', user: { ...data, id: `u-${crypto.randomUUID().slice(0, 8)}` }, actorId });
  }, [actorId]);
  const updateUser = useCallback<StoreApi['updateUser']>((id, patch) => dispatch({ type: 'UPDATE_USER', id, patch, actorId }), [actorId]);

  const createCampaign = useCallback<StoreApi['createCampaign']>((data) => {
    dispatch({ type: 'CREATE_CAMPAIGN', campaign: { ...data, id: `c-${crypto.randomUUID().slice(0, 8)}`, agentIds: [] }, actorId });
  }, [actorId]);
  const updateCampaign = useCallback<StoreApi['updateCampaign']>((id, patch) => dispatch({ type: 'UPDATE_CAMPAIGN', id, patch, actorId }), [actorId]);
  const toggleCampaignAgent = useCallback<StoreApi['toggleCampaignAgent']>((campaignId, agentId) => dispatch({ type: 'TOGGLE_CAMPAIGN_AGENT', campaignId, agentId, actorId }), [actorId]);

  const addDisposition = useCallback<StoreApi['addDisposition']>((campaignId, data) => {
    dispatch({
      type: 'ADD_DISPOSITION',
      disposition: { id: `d-${crypto.randomUUID().slice(0, 8)}`, campaignId, label: data.label, sortOrder: 99, requiresFollowup: data.requiresFollowup, isActive: true, color: data.requiresFollowup ? 'warning' : 'neutral' },
      actorId,
    });
  }, [actorId]);
  const updateDisposition = useCallback<StoreApi['updateDisposition']>((id, patch) => dispatch({ type: 'UPDATE_DISPOSITION', id, patch, actorId }), [actorId]);
  const moveDisposition = useCallback<StoreApi['moveDisposition']>((campaignId, id, direction) => dispatch({ type: 'MOVE_DISPOSITION', campaignId, id, direction }), []);

  const createReport = useCallback<StoreApi['createReport']>((data) => {
    const campaign = state.campaigns.find((c) => c.id === data.campaignId);
    const now = new Date().toISOString();
    const report: CallReport = {
      id: `CR-${reportSeq++}`,
      tenantId: campaign?.tenantId ?? '',
      campaignId: data.campaignId,
      agentId: actorId,
      dispositionId: data.dispositionId,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'CREATE_REPORT', report, actorId });
    return report;
  }, [actorId, state.campaigns]);
  const updateReport = useCallback<StoreApi['updateReport']>((id, patch, diff) => dispatch({ type: 'UPDATE_REPORT', id, patch, actorId, diff }), [actorId]);
  const resolveFollowup = useCallback<StoreApi['resolveFollowup']>((id) => dispatch({ type: 'RESOLVE_FOLLOWUP', id, actorId }), [actorId]);

  const simulateIncomingReport = useCallback<StoreApi['simulateIncomingReport']>((tenantId) => {
    const tenantCampaigns = state.campaigns.filter((c) => c.tenantId === tenantId && c.status === 'active' && c.agentIds.length > 0);
    if (tenantCampaigns.length === 0) return undefined;
    const campaign = tenantCampaigns[Math.floor(Math.random() * tenantCampaigns.length)];
    const agentId = campaign.agentIds[Math.floor(Math.random() * campaign.agentIds.length)];
    const campaignDispositions = state.dispositions.filter((d) => d.campaignId === campaign.id && d.isActive);
    if (campaignDispositions.length === 0) return undefined;
    const disposition = campaignDispositions[Math.floor(Math.random() * campaignDispositions.length)];
    const contactName = contactNamePool[Math.floor(Math.random() * contactNamePool.length)];
    const now = new Date().toISOString();
    const report: CallReport = {
      id: `CR-${reportSeq++}`,
      tenantId,
      campaignId: campaign.id,
      agentId,
      dispositionId: disposition.id,
      contactName,
      contactPhone: randomPhone(),
      notes: 'Llamada simulada para la demo en vivo.',
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'CREATE_REPORT', report, actorId: agentId });
    return report;
  }, [state.campaigns, state.dispositions]);

  const value = useMemo<StoreApi>(() => ({
    state, currentUser, switchUser, selectAgentCampaign,
    createTenant, updateTenant, createUser, updateUser,
    createCampaign, updateCampaign, toggleCampaignAgent,
    addDisposition, updateDisposition, moveDisposition,
    createReport, updateReport, resolveFollowup, simulateIncomingReport,
  }), [state, currentUser, switchUser, selectAgentCampaign, createTenant, updateTenant, createUser, updateUser, createCampaign, updateCampaign, toggleCampaignAgent, addDisposition, updateDisposition, moveDisposition, createReport, updateReport, resolveFollowup, simulateIncomingReport]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore debe usarse dentro de AppStoreProvider');
  return ctx;
}
