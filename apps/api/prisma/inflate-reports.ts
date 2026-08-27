// Script aparte del seed (plan-fase-7.md D8): infla call_reports a un
// volumen grande (~50 000 por defecto) para poder medir memoria del
// streaming CSV (criterio de aceptación de Fase 7: "Seed inflado a
// ~50 000 reportes: la descarga CSV completa termina sin que el proceso
// Node supere memoria estable"). Reusa los tenants/campañas/tipificaciones/
// agentes/turnos que ya dejó `prisma db seed` -- no crea entidades nuevas.
//
// Cada fila sintética se marca con external_call_id = 'bulk:<n>' (columna
// reservada para telefonía futura, sin uso real todavía) para poder
// limpiarla con un DELETE exacto por prefijo, sin arriesgar los ~200
// reportes reales del seed.
//
// Uso:
//   npx tsx prisma/inflate-reports.ts --count=50000
//   npx tsx prisma/inflate-reports.ts --clean
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '../generated/prisma/client';

// Rol `migrator` (BYPASSRLS, dueño del schema) -- mismo criterio que
// seed.ts. No hace falta set_config de sesión.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BULK_PREFIX = 'bulk:';
const BATCH_SIZE = 5000;

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

const CONTACT_POOL = [
  'Maria Fernandez', 'Jose Ramirez', 'Ana Torres', 'Luis Castro',
  'Carmen Ortiz', 'Pedro Gomez', 'Laura Reyes', 'Diego Morales',
  'Sofia Vargas', 'Miguel Rojas', 'Valentina Cruz', 'Andres Silva',
];
const NOTES_POOL = [
  'Cliente interesado, pidio que lo contactemos la proxima semana.',
  'Se resolvio la consulta sobre facturacion en la misma llamada.',
  'Cliente no disponible, se dejo mensaje con datos de contacto.',
  'Solicito informacion adicional por correo electronico.',
  'Confirmo interes en el servicio, pendiente de aprobacion interna.',
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function parseArgs(): { count: number; clean: boolean } {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? Number(countArg.split('=')[1]) : 50_000;
  return { count, clean };
}

async function clean(): Promise<void> {
  const { count } = await prisma.callReport.deleteMany({
    where: { externalCallId: { startsWith: BULK_PREFIX } },
  });
  console.log(`Limpieza: ${count} reportes sintéticos eliminados.`);
}

async function inflate(count: number): Promise<void> {
  const [agents, campaignAgents, campaigns, dispositions, shifts, supervisor] = await Promise.all([
    prisma.user.findMany({ where: { role: 'agent' } }),
    prisma.campaignAgent.findMany({ where: { isActive: true } }),
    prisma.campaign.findMany({ select: { id: true, tenantId: true } }),
    prisma.disposition.findMany(),
    prisma.shift.findMany(),
    prisma.user.findFirst({ where: { role: 'supervisor' } }),
  ]);
  if (agents.length === 0) {
    throw new Error('No hay agentes -- corré `npx prisma db seed` primero.');
  }
  const tenantIdByCampaign = new Map(campaigns.map((c) => [c.id, c.tenantId]));

  const campaignsByAgent = new Map<string, string[]>();
  for (const ca of campaignAgents) {
    const arr = campaignsByAgent.get(ca.userId) ?? [];
    arr.push(ca.campaignId);
    campaignsByAgent.set(ca.userId, arr);
  }
  const dispositionsByCampaign = new Map<string, typeof dispositions>();
  for (const d of dispositions) {
    const arr = dispositionsByCampaign.get(d.campaignId) ?? [];
    arr.push(d);
    dispositionsByCampaign.set(d.campaignId, arr);
  }
  const shiftsByAgent = new Map<string, string[]>();
  for (const s of shifts) {
    const arr = shiftsByAgent.get(s.userId) ?? [];
    arr.push(s.id);
    shiftsByAgent.set(s.userId, arr);
  }
  // Solo agentes con al menos una campaña asignada (el seed asigna 2
  // campañas a cada uno, pero un futuro seed distinto podría no hacerlo).
  const eligibleAgents = agents.filter((a) => (campaignsByAgent.get(a.id)?.length ?? 0) > 0);
  if (eligibleAgents.length === 0) {
    throw new Error('Ningún agente tiene campañas asignadas.');
  }

  let inserted = 0;
  let batchNumber = 0;
  while (inserted < count) {
    const batchSize = Math.min(BATCH_SIZE, count - inserted);
    const rows: Prisma.CallReportCreateManyInput[] = [];
    for (let i = 0; i < batchSize; i++) {
      const agent = pick(eligibleAgents);
      const campaignId = pick(campaignsByAgent.get(agent.id)!);
      const campaignDispositions = dispositionsByCampaign.get(campaignId);
      if (!campaignDispositions?.length) continue;
      const disposition = pick(campaignDispositions);
      const agentShifts = shiftsByAgent.get(agent.id);
      const contactName = pick(CONTACT_POOL);
      const createdAt = daysAgo(rand() * 180);

      rows.push({
        tenantId: tenantIdByCampaign.get(campaignId)!,
        campaignId,
        agentId: agent.id,
        dispositionId: disposition.id,
        contactName,
        contactPhone: `555-0${100 + Math.floor(rand() * 899)}`,
        contactEmail: rand() > 0.5 ? `${contactName.split(' ')[0].toLowerCase()}@correo.com` : null,
        notes: pick(NOTES_POOL),
        createdAt,
        updatedAt: createdAt,
        followupResolvedAt: disposition.requiresFollowup && rand() > 0.6 && supervisor
          ? new Date(createdAt.getTime() + 3600_000)
          : null,
        followupResolvedBy: disposition.requiresFollowup && rand() > 0.6 && supervisor ? supervisor.id : null,
        shiftId: agentShifts?.length ? pick(agentShifts) : null,
        externalCallId: `${BULK_PREFIX}${inserted + i}`,
      });
    }
    await prisma.callReport.createMany({ data: rows });
    inserted += batchSize;
    batchNumber++;
    console.log(`Lote ${batchNumber}: ${inserted}/${count} reportes insertados.`);
  }
}

async function main() {
  const { count, clean: shouldClean } = parseArgs();
  if (shouldClean) {
    await clean();
    return;
  }
  console.log(`Infando ${count} reportes sintéticos en lotes de ${BATCH_SIZE}...`);
  await inflate(count);
  console.log('Listo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
