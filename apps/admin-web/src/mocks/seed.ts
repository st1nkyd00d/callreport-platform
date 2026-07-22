import type { AuditLog, CallReport, Campaign, Disposition, Tenant, User } from '@callreport/shared';

// PRNG determinista para que el volumen de datos históricos sea estable entre recargas.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260718);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number, hh: number, mm: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(hh, mm, 0, 0);
  return dt.toISOString();
};

export const tenants: Tenant[] = [
  { id: 't-acme', name: 'Acme Corp', status: 'active', editWindowMinutes: 30, createdAt: daysAgo(210, 9, 0) },
  { id: 't-globex', name: 'Globex Inc', status: 'active', editWindowMinutes: 30, createdAt: daysAgo(150, 9, 0) },
  { id: 't-initech', name: 'Initech', status: 'suspended', editWindowMinutes: 30, createdAt: daysAgo(90, 9, 0) },
];

export const users: User[] = [
  { id: 'u-admin', email: 'admin@callreport.demo', fullName: 'Admin Principal', role: 'super_admin', status: 'active', lastAccessAt: minutesAgo(4) },
  { id: 'u-sup-laura', email: 'laura.mendoza@callreport.demo', fullName: 'Laura Mendoza', role: 'supervisor', status: 'active', lastAccessAt: minutesAgo(0) },
  { id: 'u-sup-elena', email: 'elena.paz@callreport.demo', fullName: 'Elena Paz', role: 'supervisor', status: 'active', lastAccessAt: minutesAgo(60) },
  { id: 'u-agent-maria', email: 'maria.garcia@callreport.demo', fullName: 'Maria Garcia', role: 'agent', status: 'active', lastAccessAt: minutesAgo(2) },
  { id: 'u-agent-ana', email: 'ana.martinez@callreport.demo', fullName: 'Ana Martinez', role: 'agent', status: 'active', lastAccessAt: minutesAgo(15) },
  { id: 'u-agent-elena', email: 'elena.rodriguez@callreport.demo', fullName: 'Elena Rodriguez', role: 'agent', status: 'active', lastAccessAt: minutesAgo(90) },
  { id: 'u-agent-carlos', email: 'carlos.lopez@callreport.demo', fullName: 'Carlos Lopez', role: 'agent', status: 'inactive', lastAccessAt: daysAgo(21, 9, 0) },
  { id: 'u-agent-luis', email: 'luis.torres@callreport.demo', fullName: 'Luis Torres', role: 'agent', status: 'active', lastAccessAt: minutesAgo(30) },
  { id: 'u-client-javier', email: 'jvargas@acmecorp.com', fullName: 'Javier Vargas', role: 'client_user', status: 'active', tenantId: 't-acme', lastAccessAt: minutesAgo(5) },
  { id: 'u-client-ana', email: 'agomez@globex.com', fullName: 'Ana Gómez', role: 'client_user', status: 'active', tenantId: 't-globex', lastAccessAt: daysAgo(120, 9, 0) },
];

export const campaigns: Campaign[] = [
  { id: 'c-acme-ventas', tenantId: 't-acme', name: 'Ventas Q3', status: 'active', agentIds: ['u-agent-maria', 'u-agent-ana', 'u-agent-luis'] },
  { id: 'c-acme-retencion', tenantId: 't-acme', name: 'Retención Q3', status: 'active', agentIds: ['u-agent-elena', 'u-agent-carlos'] },
  { id: 'c-globex-soporte', tenantId: 't-globex', name: 'Soporte Técnico', status: 'active', agentIds: ['u-agent-carlos', 'u-agent-luis'] },
  { id: 'c-globex-nuevos', tenantId: 't-globex', name: 'Nuevos Clientes', status: 'active', agentIds: ['u-agent-maria', 'u-agent-elena'] },
];

function defaultDispositions(campaignId: string): Disposition[] {
  return [
    { id: `d-${campaignId}-venta`, campaignId, label: 'Venta Completada', sortOrder: 0, requiresFollowup: false, isActive: true, icon: 'check_circle', color: 'success' },
    { id: `d-${campaignId}-consulta`, campaignId, label: 'Consulta Resuelta', sortOrder: 1, requiresFollowup: false, isActive: true, icon: 'support_agent', color: 'primary' },
    { id: `d-${campaignId}-pendiente`, campaignId, label: 'Seguimiento Pendiente', sortOrder: 2, requiresFollowup: true, isActive: true, icon: 'schedule', color: 'warning' },
    { id: `d-${campaignId}-no-interesado`, campaignId, label: 'No Interesado', sortOrder: 3, requiresFollowup: false, isActive: true, icon: 'do_not_disturb', color: 'neutral' },
  ];
}

export const dispositions: Disposition[] = campaigns.flatMap((c) => defaultDispositions(c.id));

const contactPool = [
  'Juan Carlos Silva', 'María Fernanda G.', 'Roberto Sánchez', 'Elena Rojas', 'Juan Pérez',
  'María García', 'Carlos López', 'Ana Martínez', 'Roberto Almeida', 'Elena Morales',
  'Carlos Fuentes', 'Valeria Guzmán', 'María González', 'Sofía Herrera', 'Diego Ramírez',
  'Lucía Torres', 'Fernando Castro', 'Camila Ortiz', 'Andrés Molina', 'Paula Jiménez',
];
const notesPool = [
  'El cliente solicita información detallada sobre las proyecciones del trimestre. Se requiere enviarle el reporte consolidado.',
  'Mostró interés en renovar el contrato anual si se mantienen las condiciones actuales.',
  'Cliente satisfecho con el soporte recibido, consulta resuelta en la primera llamada.',
  'No contestó preguntas de calificación, prefiere que lo contacten por correo.',
  'Solicita una llamada de seguimiento la próxima semana para cerrar la propuesta.',
  'Reclamo por facturación duplicada, escalado a soporte técnico.',
  'Cliente pidió más tiempo para evaluar la propuesta comercial.',
];

function makeReport(params: {
  id: string; campaign: Campaign; dispositionSlug: 'venta' | 'consulta' | 'pendiente' | 'no-interesado';
  agentId: string; contactName: string; createdAt: string; resolved?: boolean;
}): CallReport {
  const { id, campaign, dispositionSlug, agentId, contactName, createdAt, resolved } = params;
  const dispositionId = `d-${campaign.id}-${dispositionSlug}`;
  const isFollowup = dispositionSlug === 'pendiente';
  return {
    id,
    tenantId: campaign.tenantId,
    campaignId: campaign.id,
    agentId,
    dispositionId,
    contactName,
    contactPhone: `555-0${100 + Math.floor(rand() * 899)}`,
    contactEmail: rand() > 0.5 ? `${contactName.split(' ')[0].toLowerCase()}@correo.com` : undefined,
    notes: pick(notesPool),
    createdAt,
    updatedAt: createdAt,
    followupResolvedAt: isFollowup && resolved ? minutesAgo(Math.floor(rand() * 500)) : undefined,
    followupResolvedBy: isFollowup && resolved ? 'u-sup-laura' : undefined,
    durationSeconds: 60 + Math.floor(rand() * 800),
  };
}

const acmeVentas = campaigns[0];

// Reportes "de hoy" del agente demo (Maria Garcia) para que Nuevo Reporte / Mis Reportes
// arranquen con contenido vivo y ventanas de edición reales.
export const handcraftedTodayReports: CallReport[] = [
  makeReport({ id: 'CR-8923', campaign: acmeVentas, dispositionSlug: 'venta', agentId: 'u-agent-maria', contactName: 'Juan Carlos Silva', createdAt: minutesAgo(7) }),
  makeReport({ id: 'CR-8922', campaign: acmeVentas, dispositionSlug: 'pendiente', agentId: 'u-agent-maria', contactName: 'María Fernanda G.', createdAt: minutesAgo(18) }),
  makeReport({ id: 'CR-8910', campaign: acmeVentas, dispositionSlug: 'no-interesado', agentId: 'u-agent-maria', contactName: 'Roberto Sánchez', createdAt: minutesAgo(52) }),
  makeReport({ id: 'CR-8902', campaign: acmeVentas, dispositionSlug: 'venta', agentId: 'u-agent-maria', contactName: 'Elena Rojas', createdAt: minutesAgo(70) }),
];

const dispositionSlugs: Array<'venta' | 'consulta' | 'pendiente' | 'no-interesado'> = ['venta', 'consulta', 'pendiente', 'no-interesado'];
const weightedSlug = () => {
  const r = rand();
  if (r < 0.35) return 'venta';
  if (r < 0.65) return 'consulta';
  if (r < 0.85) return 'pendiente';
  return 'no-interesado';
};

const historicalReports: CallReport[] = [];
for (let day = 1; day < 30; day++) {
  const reportsThatDay = 2 + Math.floor(rand() * 6);
  for (let i = 0; i < reportsThatDay; i++) {
    const campaign = pick(campaigns);
    const agentId = pick(campaign.agentIds);
    const hh = 8 + Math.floor(rand() * 10);
    const mm = Math.floor(rand() * 60);
    historicalReports.push(
      makeReport({
        id: `CR-h${day}-${i}`,
        campaign,
        dispositionSlug: weightedSlug(),
        agentId,
        contactName: pick(contactPool),
        createdAt: daysAgo(day, hh, mm),
        resolved: rand() > 0.4,
      }),
    );
  }
}
void dispositionSlugs;

export const reports: CallReport[] = [...handcraftedTodayReports, ...historicalReports].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
);

export const auditLogs: AuditLog[] = [
  {
    id: 'log-1', userId: 'u-admin', userEmail: 'admin@callreport.demo', action: 'create',
    entityType: 'Tenant', entityId: 't-initech', diff: [{ field: 'status', before: null, after: 'suspended' }],
    ipAddress: '192.168.1.10', createdAt: daysAgo(90, 9, 5),
  },
  {
    id: 'log-2', userId: 'u-sup-laura', userEmail: 'laura.mendoza@callreport.demo', action: 'update',
    entityType: 'CallReport', entityId: 'CR-8850',
    diff: [{ field: 'contact_phone', before: '555-0134', after: '555-0143' }],
    ipAddress: '10.0.0.12', createdAt: daysAgo(2, 11, 15),
  },
  {
    id: 'log-3', userId: 'u-client-javier', userEmail: 'jvargas@acmecorp.com', action: 'resolve_followup',
    entityType: 'CallReport', entityId: 'CR-8790', ipAddress: '187.190.4.22', createdAt: daysAgo(1, 16, 40),
  },
];

export const contactNamePool = contactPool;
export const notesPoolExport = notesPool;
export function randomPhone() {
  return `555-0${100 + Math.floor(rand() * 899)}`;
}
