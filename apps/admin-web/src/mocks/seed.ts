import type { AuditLog, CallReport, Campaign, DispositionCode, Disposition, Shift, Tenant, User } from '@callreport/shared';
import { DEFAULT_DISPOSITIONS } from '@callreport/shared';

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
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number, hh: number, mm: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(hh, mm, 0, 0);
  return dt.toISOString();
};
const daysFromNow = (d: number, hh: number, mm: number) => daysAgo(-d, hh, mm);

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

// Fuente única del set de tipificaciones: DEFAULT_DISPOSITIONS en
// packages/shared/src/constants.ts.
function defaultDispositions(campaignId: string): Disposition[] {
  return DEFAULT_DISPOSITIONS.map((d, i) => ({
    id: `d-${campaignId}-${d.code}`,
    campaignId,
    label: d.label,
    code: d.code,
    sortOrder: i,
    requiresFollowup: d.requiresFollowup,
    requiresDetail: d.requiresDetail,
    requiresSchedule: d.requiresSchedule,
    isActive: true,
    icon: d.icon,
    color: d.color,
  }));
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
const detailPool = [
  'Solicita hablar con un gerente.',
  'Pregunta sobre una promoción vista en redes sociales.',
  'Consulta general sobre el catálogo de productos.',
  'Pidió que se le contacte en otro horario.',
  'Reportó un problema con el sitio web.',
];

function makeReport(params: {
  id: string; campaign: Campaign; dispositionSlug: DispositionCode;
  agentId: string; contactName: string; createdAt: string; resolved?: boolean;
  shiftId?: string; scheduledAt?: string; detailText?: string;
}): CallReport {
  const { id, campaign, dispositionSlug, agentId, contactName, createdAt, resolved, shiftId, scheduledAt, detailText } = params;
  const dispositionId = `d-${campaign.id}-${dispositionSlug}`;
  const isFollowup = DEFAULT_DISPOSITIONS.find((d) => d.code === dispositionSlug)?.requiresFollowup ?? false;
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
    shiftId,
    scheduledAt,
    detailText,
  };
}

// ---------------------------------------------------------------------
// Turnos (clock in/out): ~20 turnos cerrados de 6-9h por agente en los
// últimos 30 días + un turno abierto ahora mismo para Maria y Ana, para
// que el prototipo arranque con estado mixto "en turno" / "fuera de
// turno" y demuestre el bloqueo de reportes sin turno para el resto.
// ---------------------------------------------------------------------
interface SeedShift {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | undefined;
}

const agentIds = ['u-agent-maria', 'u-agent-ana', 'u-agent-elena', 'u-agent-carlos', 'u-agent-luis'];
const shiftsByAgent = new Map<string, SeedShift[]>();
let shiftSeq = 1;
for (const agentId of agentIds) {
  const agentShifts: SeedShift[] = [];
  for (let day = 29; day >= 1; day--) {
    if (rand() > 0.72) continue; // día libre
    const startHour = 8 + Math.floor(rand() * 3);
    const startMinute = Math.floor(rand() * 60);
    const durationHours = 6 + rand() * 3;
    const startedAtDate = new Date(daysAgo(day, startHour, startMinute));
    const endedAtDate = new Date(startedAtDate.getTime() + durationHours * 3600_000);
    agentShifts.push({ id: `sh-${shiftSeq++}`, userId: agentId, startedAt: startedAtDate.toISOString(), endedAt: endedAtDate.toISOString() });
  }
  agentShifts.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  shiftsByAgent.set(agentId, agentShifts);
}

// Turnos abiertos "ahora" (no forman parte del stream determinista, usan
// el reloj real como el resto de los datos "de hoy" de este archivo).
const openShiftMaria: SeedShift = { id: 'sh-open-maria', userId: 'u-agent-maria', startedAt: hoursAgo(3), endedAt: undefined };
const openShiftAna: SeedShift = { id: 'sh-open-ana', userId: 'u-agent-ana', startedAt: hoursAgo(2), endedAt: undefined };
shiftsByAgent.get('u-agent-maria')!.push(openShiftMaria);
shiftsByAgent.get('u-agent-ana')!.push(openShiftAna);

export const shifts: Shift[] = Array.from(shiftsByAgent.values()).flat();

const acmeVentas = campaigns[0];

// Reportes "de hoy" del agente demo (Maria Garcia) para que Nuevo Reporte / Mis Reportes
// arranquen con contenido vivo y ventanas de edición reales. Todos cuelgan del turno
// abierto de Maria (openShiftMaria).
export const handcraftedTodayReports: CallReport[] = [
  makeReport({ id: 'CR-8923', campaign: acmeVentas, dispositionSlug: 'venta', agentId: 'u-agent-maria', contactName: 'Juan Carlos Silva', createdAt: minutesAgo(7), shiftId: openShiftMaria.id }),
  makeReport({ id: 'CR-8922', campaign: acmeVentas, dispositionSlug: 'seguimiento', agentId: 'u-agent-maria', contactName: 'María Fernanda G.', createdAt: minutesAgo(18), shiftId: openShiftMaria.id }),
  makeReport({ id: 'CR-8910', campaign: acmeVentas, dispositionSlug: 'no_interesado', agentId: 'u-agent-maria', contactName: 'Roberto Sánchez', createdAt: minutesAgo(52), shiftId: openShiftMaria.id }),
  makeReport({ id: 'CR-8902', campaign: acmeVentas, dispositionSlug: 'venta', agentId: 'u-agent-maria', contactName: 'Elena Rojas', createdAt: minutesAgo(70), shiftId: openShiftMaria.id }),
  makeReport({ id: 'CR-8930', campaign: acmeVentas, dispositionSlug: 'cita', agentId: 'u-agent-maria', contactName: 'Sofía Herrera', createdAt: minutesAgo(3), shiftId: openShiftMaria.id, scheduledAt: daysFromNow(2, 15, 0) }),
  makeReport({ id: 'CR-8929', campaign: acmeVentas, dispositionSlug: 'otro', agentId: 'u-agent-maria', contactName: 'Diego Ramírez', createdAt: minutesAgo(35), shiftId: openShiftMaria.id, detailText: 'Solicita hablar con un gerente.' }),
];

const weightedSlug = (): DispositionCode => {
  const r = rand();
  if (r < 0.2) return 'venta';
  if (r < 0.3) return 'cita';
  if (r < 0.5) return 'consulta';
  if (r < 0.6) return 'mensaje';
  if (r < 0.75) return 'seguimiento';
  if (r < 0.85) return 'reclamo';
  if (r < 0.95) return 'no_interesado';
  return 'otro';
};

const campaignsByAgent = new Map<string, Campaign[]>();
for (const campaign of campaigns) {
  for (const agentId of campaign.agentIds) {
    const arr = campaignsByAgent.get(agentId) ?? [];
    arr.push(campaign);
    campaignsByAgent.set(agentId, arr);
  }
}

// Cada reporte histórico cuelga de un turno cerrado real del agente, con
// created_at cayendo dentro de la ventana de ese turno (mismo enfoque que
// apps/api/prisma/seed.ts, para que el prototipo y la base real "se
// sientan" igual).
const historicalReports: CallReport[] = [];
let remaining = 200;
let historySeq = 0;
for (const agentId of agentIds) {
  if (remaining <= 0) break;
  const agentCampaigns = campaignsByAgent.get(agentId) ?? [];
  if (agentCampaigns.length === 0) continue;
  const agentShifts = (shiftsByAgent.get(agentId) ?? []).filter((s) => s.endedAt);
  for (const shift of agentShifts) {
    if (remaining <= 0) break;
    const reportsThisShift = Math.min(remaining, 2 + Math.floor(rand() * 4));
    const shiftStart = new Date(shift.startedAt).getTime();
    const shiftEnd = new Date(shift.endedAt!).getTime();
    for (let i = 0; i < reportsThisShift && remaining > 0; i++) {
      const campaign = pick(agentCampaigns);
      const dispositionSlug = weightedSlug();
      const createdAt = new Date(shiftStart + rand() * Math.max(shiftEnd - shiftStart, 60_000)).toISOString();
      historicalReports.push(
        makeReport({
          id: `CR-h${historySeq++}`,
          campaign,
          dispositionSlug,
          agentId,
          contactName: pick(contactPool),
          createdAt,
          resolved: rand() > 0.4,
          shiftId: shift.id,
          scheduledAt: dispositionSlug === 'cita' ? daysFromNow(1 + Math.floor(rand() * 13), 9 + Math.floor(rand() * 8), Math.floor(rand() * 60)) : undefined,
          detailText: dispositionSlug === 'otro' ? pick(detailPool) : undefined,
        }),
      );
      remaining--;
    }
  }
}

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
