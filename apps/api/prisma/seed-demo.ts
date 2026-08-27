import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { DEFAULT_DISPOSITIONS } from '../src/campaigns/default-dispositions';

// Fase 8 (D12): script APARTE de prisma/seed.ts, a propósito. Las 11
// suites e2e dependen de los emails/contraseña/2-tenants exactos que
// pone seed.ts -- "pulir" ese archivo para una demo (nombres de empresa
// reales, distribución no uniforme, fechas recientes) rompería el CI.
// Este script nunca lo toca ni lo reusa; corre contra un branch de Neon
// de DEMO propio, jamás contra el de desarrollo o el de CI.
//
// Uso (--confirm es obligatorio, ver la guarda de abajo):
//   DATABASE_URL="<branch de demo>" npm run seed:demo -- --confirm

if (!process.argv.includes('--confirm')) {
  console.error(
    'seed-demo: este script BORRA todos los datos existentes antes de poblar.\n' +
      'Corré con --confirm después de verificar que DATABASE_URL apunta al branch de DEMO de Neon (nunca al de desarrollo ni al de CI):\n' +
      '  npm run seed:demo -- --confirm',
  );
  process.exit(1);
}

// Mismo rol que prisma/seed.ts: `migrator` (BYPASSRLS) vía DATABASE_URL
// (endpoint directo).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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
const rand = mulberry32(20260827);
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

// Empresas cliente realistas -- distintos rubros, para que la demo no se
// vea como "dos placeholders" (Acme/Globex de prisma/seed.ts).
const TENANTS = [
  { name: 'Andes Seguros', slug: 'andes' },
  { name: 'Ferretería del Valle', slug: 'ferreteria' },
  { name: 'Clínica San Rafael', slug: 'clinica' },
];

const CONTACT_POOL = [
  'María Fernández', 'José Ramírez', 'Ana Torres', 'Luis Castro',
  'Carmen Ortiz', 'Pedro Gómez', 'Laura Reyes', 'Diego Morales',
  'Sofía Vargas', 'Miguel Rojas', 'Valentina Cruz', 'Andrés Silva',
  'Camila Herrera', 'Javier Mendoza', 'Isabel Paredes', 'Ricardo Núñez',
  'Paula Delgado', 'Fernando Aguilar', 'Gabriela Campos', 'Sergio Vega',
  'Ñoño Paz', 'Peña González',
];

const NOTES_BY_CODE: Record<string, string[]> = {
  venta: [
    'Cliente confirmó la compra, coordina retiro esta semana.',
    'Cerró la venta del plan anual, pidió factura A.',
  ],
  cita: [
    'Agenda visita técnica para revisar instalación.',
    'Turno confirmado, pidió recordatorio un día antes.',
  ],
  consulta: [
    'Consultó por horarios de atención, resuelto en la llamada.',
    'Dudas sobre el estado de su pedido, ya se le informó.',
  ],
  mensaje: [
    'No atendió, se dejó mensaje con número de contacto.',
    'Buzón de voz lleno, reintentar mañana a la mañana.',
  ],
  seguimiento: [
    'Pidió que lo llamemos la semana que viene para cerrar.',
    'Está evaluando la propuesta con su socio, seguimiento pendiente.',
  ],
  reclamo: [
    'Reclamo por demora en la entrega, escalado a supervisión.',
    'No está conforme con el servicio recibido, pidió reembolso.',
  ],
  no_interesado: [
    'No le interesa por el momento, pidió no ser contactado.',
    'Ya contrató con otro proveedor.',
  ],
  otro: ['Consulta fuera de lo habitual, ver detalle.'],
};

const DETAIL_POOL = [
  'Pregunta por un servicio que todavía no ofrecemos.',
  'Pidió hablar directamente con un gerente.',
];

async function main() {
  console.log('seed-demo: borrando datos existentes del branch de demo...');
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

  const tenants = [];
  for (const t of TENANTS) {
    tenants.push(await prisma.tenant.create({ data: { name: t.name, status: 'active' } }));
  }

  await prisma.user.create({
    data: {
      email: 'admin@callreport.demo',
      passwordHash,
      fullName: 'Admin Principal',
      role: 'super_admin',
    },
  });
  const supervisors = [
    await prisma.user.create({
      data: {
        email: 'supervisor@callreport.demo',
        passwordHash,
        fullName: 'Laura Mendoza',
        role: 'supervisor',
      },
    }),
  ];

  const agentNames = [
    'María García', 'Ana Martínez', 'Carlos López',
    'Julián Torres', 'Rocío Fernández', 'Tomás Aguirre',
  ];
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

  const clientsByTenant = new Map<string, Awaited<ReturnType<typeof prisma.user.create>>[]>();
  for (const tenant of tenants) {
    const slug = TENANTS.find((t) => t.name === tenant.name)!.slug;
    const clients = [];
    for (let i = 0; i < 2; i++) {
      clients.push(
        await prisma.user.create({
          data: {
            email: `contacto${i + 1}@${slug}.demo`,
            passwordHash,
            fullName: `Contacto ${tenant.name} ${i + 1}`,
            role: 'client_user',
          },
        }),
      );
    }
    clientsByTenant.set(tenant.id, clients);
  }
  await prisma.tenantMembership.createMany({
    data: tenants.flatMap((tenant) =>
      (clientsByTenant.get(tenant.id) ?? []).map((u) => ({ userId: u.id, tenantId: tenant.id })),
    ),
  });

  const campaignsByTenant = new Map<string, Awaited<ReturnType<typeof prisma.campaign.create>>[]>();
  const allCampaigns: Awaited<ReturnType<typeof prisma.campaign.create>>[] = [];
  for (const tenant of tenants) {
    const campaigns = [
      await prisma.campaign.create({ data: { tenantId: tenant.id, name: `${tenant.name} - Ventas`, status: 'active' } }),
      await prisma.campaign.create({ data: { tenantId: tenant.id, name: `${tenant.name} - Atención al cliente`, status: 'active' } }),
    ];
    campaignsByTenant.set(tenant.id, campaigns);
    allCampaigns.push(...campaigns);
  }

  const dispositionsByCampaign = new Map<string, Awaited<ReturnType<typeof prisma.disposition.create>>[]>();
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

  const agentsByCampaign = new Map<string, typeof agents>();
  const campaignsByAgent = new Map<string, typeof allCampaigns>();
  for (const campaign of allCampaigns) {
    const assigned = pickN(agents, 3);
    agentsByCampaign.set(campaign.id, assigned);
    await prisma.campaignAgent.createMany({
      data: assigned.map((a) => ({ campaignId: campaign.id, userId: a.id })),
    });
    for (const agent of assigned) {
      const arr = campaignsByAgent.get(agent.id) ?? [];
      arr.push(campaign);
      campaignsByAgent.set(agent.id, arr);
    }
  }

  // Turnos concentrados en los últimos 14 días, horario laboral --
  // "datos demo pulidos" (plan.md tarea 6): una demo con reportes de hace
  // 3 meses no se siente viva.
  interface SeedShift { id: string; userId: string; startedAt: Date; endedAt: Date | null }
  const shiftsByAgent = new Map<string, SeedShift[]>();
  const shiftRows: Prisma.ShiftCreateManyInput[] = [];
  for (let a = 0; a < agents.length; a++) {
    const agent = agents[a];
    const agentShifts: SeedShift[] = [];
    for (let day = 13; day >= 1; day--) {
      const dow = daysAgo(day, 0, 0).getDay();
      if (dow === 0 || dow === 6) continue; // fines de semana libres
      if (rand() > 0.85) continue; // día libre ocasional
      const startHour = 9 + Math.floor(rand() * 2);
      const durationHours = 6 + rand() * 2.5;
      const startedAt = daysAgo(day, startHour, Math.floor(rand() * 60));
      const endedAt = new Date(startedAt.getTime() + durationHours * 3600_000);
      agentShifts.push({ id: randomUUID(), userId: agent.id, startedAt, endedAt });
    }
    if (a < 3) {
      const startedAt = daysAgo(0, 9 + Math.floor(rand() * 2), Math.floor(rand() * 60));
      agentShifts.push({ id: randomUUID(), userId: agent.id, startedAt, endedAt: null });
    }
    agentShifts.sort((x, y) => x.startedAt.getTime() - y.startedAt.getTime());
    shiftsByAgent.set(agent.id, agentShifts);
    shiftRows.push(...agentShifts);
  }
  await prisma.shift.createMany({ data: shiftRows });

  // Distribución creíble, no uniforme: mayoría consultas/ventas, una cola
  // larga de seguimientos/citas/reclamos (D12).
  function weightedDisposition(dispositions: Awaited<ReturnType<typeof prisma.disposition.create>>[]) {
    const r = rand();
    if (r < 0.28) return dispositions[0]; // venta
    if (r < 0.4) return dispositions[1]; // cita
    if (r < 0.62) return dispositions[2]; // consulta
    if (r < 0.72) return dispositions[3]; // mensaje
    if (r < 0.85) return dispositions[4]; // seguimiento
    if (r < 0.92) return dispositions[5]; // reclamo
    if (r < 0.98) return dispositions[6]; // no_interesado
    return dispositions[7]; // otro
  }

  const reportsData: Prisma.CallReportCreateManyInput[] = [];
  for (const agent of agents) {
    const agentCampaigns = campaignsByAgent.get(agent.id) ?? [];
    if (agentCampaigns.length === 0) continue;
    const agentShifts = shiftsByAgent.get(agent.id) ?? [];
    for (const shift of agentShifts) {
      const reportsThisShift = 3 + Math.floor(rand() * 5);
      const shiftStart = shift.startedAt.getTime();
      const shiftEnd = (shift.endedAt ?? new Date()).getTime();
      for (let i = 0; i < reportsThisShift; i++) {
        const campaign = pick(agentCampaigns);
        const dispositions = dispositionsByCampaign.get(campaign.id)!;
        const disposition = weightedDisposition(dispositions);
        const createdAt = new Date(shiftStart + rand() * Math.max(shiftEnd - shiftStart, 60_000));
        const contactName = pick(CONTACT_POOL);
        const notesPool = NOTES_BY_CODE[disposition.code ?? 'otro'] ?? NOTES_BY_CODE.otro;

        // Seguimientos: mezcla deliberada de resueltos, pendientes al día
        // y pendientes VENCIDOS -- para que la pantalla de Seguimientos y
        // los badges se vean con contenido real en la demo (D12).
        let followupResolvedAt: Date | null = null;
        let followupResolvedBy: string | null = null;
        if (disposition.requiresFollowup) {
          const r2 = rand();
          if (r2 < 0.4) {
            followupResolvedAt = new Date(createdAt.getTime() + 3600_000 * (1 + rand() * 20));
            followupResolvedBy = supervisors[0].id;
          }
          // el resto queda pendiente (vencido si createdAt es de hace
          // varios días, al día si es reciente -- ya lo resuelve la
          // distribución temporal de los turnos).
        }

        reportsData.push({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          agentId: agent.id,
          dispositionId: disposition.id,
          contactName,
          contactPhone: `555-0${100 + Math.floor(rand() * 899)}`,
          contactEmail: rand() > 0.4 ? `${contactName.split(' ')[0].toLowerCase()}@correo.com` : null,
          notes: pick(notesPool),
          createdAt,
          updatedAt: createdAt,
          followupResolvedAt,
          followupResolvedBy,
          shiftId: shift.id,
          scheduledAt:
            disposition.code === 'cita'
              ? daysFromNow(1 + Math.floor(rand() * 10), 9 + Math.floor(rand() * 8), Math.floor(rand() * 60))
              : null,
          detailText: disposition.code === 'otro' ? pick(DETAIL_POOL) : null,
        });
      }
    }
  }
  await prisma.callReport.createMany({ data: reportsData });

  const totalUsers = 1 + supervisors.length + agents.length + tenants.length * 2;
  console.log(
    `seed-demo completo: ${tenants.length} tenants, ${totalUsers} usuarios, ` +
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
