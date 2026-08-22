import 'dotenv/config';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

// Conecta con DATABASE_URL (rol `migrator`, BYPASSRLS — ver prisma/init/01-roles.sql).
// No hace falta ningún set_config de sesión en este script: migrator no
// está sujeto a las políticas RLS de prisma/migrations/*_enable_rls.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Mismo algoritmo y semilla que apps/admin-web/src/mocks/seed.ts, para
// que el volumen de datos "se sienta" igual entre el prototipo mock y la
// base real. Reimplementado standalone: este script vive fuera de
// packages/shared.
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
const pickN = <T,>(arr: T[], n: number): T[] =>
  [...arr].sort(() => rand() - 0.5).slice(0, n);

function daysAgo(days: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function daysFromNow(days: number, hour: number, minute: number): Date {
  return daysAgo(-days, hour, minute);
}

// Mismo set que packages/shared/src/constants.ts (DEFAULT_DISPOSITIONS).
// Copia standalone a propósito (ver comentario de mulberry32 arriba): este
// script vive fuera de packages/shared. Si cambia una lista, actualizar
// también la otra.
const DEFAULT_DISPOSITIONS = [
  { code: 'venta', label: 'Venta Completada', requiresFollowup: false, requiresDetail: false, requiresSchedule: false, color: 'success', icon: 'check_circle' },
  { code: 'cita', label: 'Cita Agendada', requiresFollowup: true, requiresDetail: false, requiresSchedule: true, color: 'teal', icon: 'event_available' },
  { code: 'consulta', label: 'Consulta Resuelta', requiresFollowup: false, requiresDetail: false, requiresSchedule: false, color: 'primary', icon: 'support_agent' },
  { code: 'mensaje', label: 'Mensaje Tomado', requiresFollowup: true, requiresDetail: false, requiresSchedule: false, color: 'warning', icon: 'sticky_note_2' },
  { code: 'seguimiento', label: 'Seguimiento Pendiente', requiresFollowup: true, requiresDetail: false, requiresSchedule: false, color: 'warning', icon: 'schedule' },
  { code: 'reclamo', label: 'Reclamo / Queja', requiresFollowup: true, requiresDetail: false, requiresSchedule: false, color: 'error', icon: 'report_problem' },
  { code: 'no_interesado', label: 'No Interesado', requiresFollowup: false, requiresDetail: false, requiresSchedule: false, color: 'neutral', icon: 'do_not_disturb' },
  { code: 'otro', label: 'Otro', requiresFollowup: false, requiresDetail: true, requiresSchedule: false, color: 'purple', icon: 'more_horiz' },
] as const;

const DETAIL_POOL = [
  'Solicito hablar con un gerente.',
  'Pregunta sobre una promocion vista en redes sociales.',
  'Consulta general sobre el catalogo de productos.',
  'Pidio que se le contacte en otro horario.',
  'Reporto un problema con el sitio web.',
];

const CONTACT_POOL = [
  'Maria Fernandez', 'Jose Ramirez', 'Ana Torres', 'Luis Castro',
  'Carmen Ortiz', 'Pedro Gomez', 'Laura Reyes', 'Diego Morales',
  'Sofia Vargas', 'Miguel Rojas', 'Valentina Cruz', 'Andres Silva',
  'Camila Herrera', 'Javier Mendoza', 'Isabel Paredes', 'Ricardo Nunez',
  'Paula Delgado', 'Fernando Aguilar', 'Gabriela Campos', 'Sergio Vega',
];

const NOTES_POOL = [
  'Cliente interesado, pidio que lo contactemos la proxima semana.',
  'Se resolvio la consulta sobre facturacion en la misma llamada.',
  'Cliente no disponible, se dejo mensaje con datos de contacto.',
  'Solicito informacion adicional por correo electronico.',
  'Confirmo interes en el servicio, pendiente de aprobacion interna.',
  'No desea continuar con el proceso por el momento.',
  'Reagendar llamada: el cliente estaba en otra reunion.',
];

async function main() {
  console.log('Limpiando datos existentes (seed idempotente)...');
  await prisma.$transaction([
    prisma.pushToken.deleteMany(),
    prisma.callReport.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.disposition.deleteMany(),
    prisma.campaignAgent.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.tenantMembership.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);

  const passwordHash = await argon2.hash('Password123!');

  const acme = await prisma.tenant.create({
    data: { name: 'Acme Corp', status: 'active' },
  });
  const globex = await prisma.tenant.create({
    data: { name: 'Globex', status: 'active' },
  });

  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@callreport.demo',
      passwordHash,
      fullName: 'Admin Principal',
      role: 'super_admin',
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: 'supervisor@callreport.demo',
      passwordHash,
      fullName: 'Laura Mendoza',
      role: 'supervisor',
    },
  });

  const agentNames = ['Maria Garcia', 'Ana Martinez', 'Carlos Lopez'];
  const agents = [];
  for (let i = 0; i < agentNames.length; i++) {
    agents.push(
      await prisma.user.create({
        data: {
          email: `agent${i + 1}@callreport.demo`,
          passwordHash,
          fullName: agentNames[i],
          role: 'agent',
        },
      }),
    );
  }

  const acmeClients = [];
  for (let i = 0; i < 2; i++) {
    acmeClients.push(
      await prisma.user.create({
        data: {
          email: `client${i + 1}@acmecorp.demo`,
          passwordHash,
          fullName: `Cliente Acme ${i + 1}`,
          role: 'client_user',
        },
      }),
    );
  }
  const globexClients = [];
  for (let i = 0; i < 2; i++) {
    globexClients.push(
      await prisma.user.create({
        data: {
          email: `client${i + 1}@globex.demo`,
          passwordHash,
          fullName: `Cliente Globex ${i + 1}`,
          role: 'client_user',
        },
      }),
    );
  }

  await prisma.tenantMembership.createMany({
    data: [
      ...acmeClients.map((u) => ({ userId: u.id, tenantId: acme.id })),
      ...globexClients.map((u) => ({ userId: u.id, tenantId: globex.id })),
    ],
  });

  const acmeCampaigns = [
    await prisma.campaign.create({
      data: { tenantId: acme.id, name: 'Acme - Ventas', status: 'active' },
    }),
    await prisma.campaign.create({
      data: { tenantId: acme.id, name: 'Acme - Soporte', status: 'active' },
    }),
  ];
  const globexCampaigns = [
    await prisma.campaign.create({
      data: { tenantId: globex.id, name: 'Globex - Ventas', status: 'active' },
    }),
    await prisma.campaign.create({
      data: { tenantId: globex.id, name: 'Globex - Soporte', status: 'active' },
    }),
  ];
  const allCampaigns = [...acmeCampaigns, ...globexCampaigns];

  const dispositionsByCampaign = new Map<
    string,
    Awaited<ReturnType<typeof prisma.disposition.create>>[]
  >();
  for (const campaign of allCampaigns) {
    const created = [];
    for (let i = 0; i < DEFAULT_DISPOSITIONS.length; i++) {
      const d = DEFAULT_DISPOSITIONS[i];
      created.push(
        await prisma.disposition.create({
          data: {
            campaignId: campaign.id,
            label: d.label,
            code: d.code,
            sortOrder: i,
            requiresFollowup: d.requiresFollowup,
            requiresDetail: d.requiresDetail,
            requiresSchedule: d.requiresSchedule,
            isActive: true,
            color: d.color,
            icon: d.icon,
          },
        }),
      );
    }
    dispositionsByCampaign.set(campaign.id, created);
  }

  // Cada campaña recibe 2 agentes elegidos determinísticamente,
  // cruzando ambos tenants — le da a los tests de aislamiento de la
  // Fase 2 un caso real de "el agente ve solo sus propias campañas,
  // incluso a través de tenants".
  const agentsByCampaign = new Map<string, typeof agents>();
  for (const campaign of allCampaigns) {
    const assigned = pickN(agents, 2);
    agentsByCampaign.set(campaign.id, assigned);
    await prisma.campaignAgent.createMany({
      data: assigned.map((a) => ({ campaignId: campaign.id, userId: a.id })),
    });
  }
  const campaignsByAgent = new Map<string, typeof allCampaigns>();
  for (const campaign of allCampaigns) {
    for (const agent of agentsByCampaign.get(campaign.id)!) {
      const arr = campaignsByAgent.get(agent.id) ?? [];
      arr.push(campaign);
      campaignsByAgent.set(agent.id, arr);
    }
  }

  // Turnos (clock in/out): ~20 turnos cerrados de 6-9h por agente en los
  // últimos 30 días + un turno abierto hoy para los dos primeros agentes,
  // para que el seed arranque con estado mixto "en turno" / "fuera de
  // turno" (útil para demostrar el bloqueo de reportes sin turno).
  interface SeedShift {
    id: string;
    userId: string;
    startedAt: Date;
    endedAt: Date | null;
  }
  const shiftsByAgent = new Map<string, SeedShift[]>();
  const shiftRows: Prisma.ShiftCreateManyInput[] = [];
  for (let a = 0; a < agents.length; a++) {
    const agent = agents[a];
    const agentShifts: SeedShift[] = [];
    for (let day = 29; day >= 1; day--) {
      if (rand() > 0.72) continue; // día libre
      const startHour = 8 + Math.floor(rand() * 3);
      const startMinute = Math.floor(rand() * 60);
      const durationHours = 6 + rand() * 3;
      const startedAt = daysAgo(day, startHour, startMinute);
      const endedAt = new Date(startedAt.getTime() + durationHours * 3600_000);
      agentShifts.push({ id: randomUUID(), userId: agent.id, startedAt, endedAt });
    }
    if (a < 2) {
      const startedAt = daysAgo(0, 8 + Math.floor(rand() * 2), Math.floor(rand() * 60));
      agentShifts.push({ id: randomUUID(), userId: agent.id, startedAt, endedAt: null });
    }
    agentShifts.sort((x, y) => x.startedAt.getTime() - y.startedAt.getTime());
    shiftsByAgent.set(agent.id, agentShifts);
    shiftRows.push(...agentShifts);
  }
  await prisma.shift.createMany({ data: shiftRows });

  function weightedDisposition(
    dispositions: Awaited<ReturnType<typeof prisma.disposition.create>>[],
  ) {
    const r = rand();
    if (r < 0.2) return dispositions[0]; // venta
    if (r < 0.3) return dispositions[1]; // cita
    if (r < 0.5) return dispositions[2]; // consulta
    if (r < 0.6) return dispositions[3]; // mensaje
    if (r < 0.75) return dispositions[4]; // seguimiento
    if (r < 0.85) return dispositions[5]; // reclamo
    if (r < 0.95) return dispositions[6]; // no_interesado
    return dispositions[7]; // otro
  }

  // Cada reporte cuelga de un turno real del agente que lo crea (espeja la
  // política RLS call_reports_agent_insert), con created_at cayendo dentro
  // de la ventana del turno.
  const reportsData: Prisma.CallReportCreateManyInput[] = [];
  let remaining = 200;
  for (const agent of agents) {
    if (remaining <= 0) break;
    const agentCampaigns = campaignsByAgent.get(agent.id) ?? [];
    if (agentCampaigns.length === 0) continue;
    const agentShifts = shiftsByAgent.get(agent.id) ?? [];
    for (const shift of agentShifts) {
      if (remaining <= 0) break;
      const reportsThisShift = Math.min(remaining, 2 + Math.floor(rand() * 4));
      const shiftStart = shift.startedAt.getTime();
      const shiftEnd = (shift.endedAt ?? new Date()).getTime();
      for (let i = 0; i < reportsThisShift && remaining > 0; i++) {
        const campaign = pick(agentCampaigns);
        const dispositions = dispositionsByCampaign.get(campaign.id)!;
        const disposition = weightedDisposition(dispositions);
        const createdAt = new Date(shiftStart + rand() * Math.max(shiftEnd - shiftStart, 60_000));
        const contactName = pick(CONTACT_POOL);
        const resolved = disposition.requiresFollowup && rand() > 0.6;

        reportsData.push({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          agentId: agent.id,
          dispositionId: disposition.id,
          contactName,
          contactPhone: `555-0${100 + Math.floor(rand() * 899)}`,
          contactEmail:
            rand() > 0.5
              ? `${contactName.split(' ')[0].toLowerCase()}@correo.com`
              : null,
          notes: pick(NOTES_POOL),
          createdAt,
          updatedAt: createdAt,
          followupResolvedAt: resolved
            ? new Date(createdAt.getTime() + 3600_000)
            : null,
          followupResolvedBy: resolved ? supervisor.id : null,
          shiftId: shift.id,
          scheduledAt:
            disposition.code === 'cita'
              ? daysFromNow(1 + Math.floor(rand() * 13), 9 + Math.floor(rand() * 8), Math.floor(rand() * 60))
              : null,
          detailText: disposition.code === 'otro' ? pick(DETAIL_POOL) : null,
        });
        remaining--;
      }
    }
  }

  await prisma.callReport.createMany({ data: reportsData });

  console.log(
    `Seed completo: 2 tenants, ${1 + 1 + agents.length + acmeClients.length + globexClients.length} usuarios, ` +
      `${allCampaigns.length} campañas, ${shiftRows.length} turnos, ${reportsData.length} call_reports.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
