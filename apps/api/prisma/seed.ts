import 'dotenv/config';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

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

const DEFAULT_DISPOSITIONS = [
  { label: 'Venta Completada', requiresFollowup: false },
  { label: 'Consulta Resuelta', requiresFollowup: false },
  { label: 'Seguimiento Pendiente', requiresFollowup: true },
  { label: 'No Interesado', requiresFollowup: false },
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
            sortOrder: i,
            requiresFollowup: d.requiresFollowup,
            isActive: true,
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

  function weightedDisposition(
    dispositions: Awaited<ReturnType<typeof prisma.disposition.create>>[],
  ) {
    const r = rand();
    if (r < 0.35) return dispositions[0]; // Venta Completada
    if (r < 0.65) return dispositions[1]; // Consulta Resuelta
    if (r < 0.85) return dispositions[2]; // Seguimiento Pendiente
    return dispositions[3]; // No Interesado
  }

  const reportsData: Prisma.CallReportCreateManyInput[] = [];
  let remaining = 200;
  for (let day = 0; day < 30 && remaining > 0; day++) {
    const countToday =
      day === 29 ? remaining : Math.min(remaining, 4 + Math.floor(rand() * 5));
    for (let i = 0; i < countToday; i++) {
      const campaign = pick(allCampaigns);
      const campaignAgents = agentsByCampaign.get(campaign.id)!;
      const agent = pick(campaignAgents);
      const dispositions = dispositionsByCampaign.get(campaign.id)!;
      const disposition = weightedDisposition(dispositions);
      const createdAt = daysAgo(day, 8 + Math.floor(rand() * 10), Math.floor(rand() * 60));
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
      });
      remaining--;
    }
  }

  await prisma.callReport.createMany({ data: reportsData });

  console.log(
    `Seed completo: 2 tenants, ${1 + 1 + agents.length + acmeClients.length + globexClients.length} usuarios, ` +
      `${allCampaigns.length} campañas, ${reportsData.length} call_reports.`,
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
