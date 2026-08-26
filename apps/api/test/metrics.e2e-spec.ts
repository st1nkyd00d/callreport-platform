import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, UserStatus } from '../generated/prisma/enums';

// Cubre el criterio de aceptación de Fase 6 (plan.md): "métricas
// contrastadas a mano contra el seed (una consulta SQL de control por
// gráfico)". Cada gráfico se compara contra su propia consulta de
// control vía Prisma (groupBy/count), sin duplicar el SQL crudo del
// servicio -- mismo criterio que ya usa realtime-reports.e2e-spec.ts
// para GET /reports/summary. También cubre el 403 de client_user/agent.
const PASSWORD = 'Password123!';

jest.setTimeout(30000);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; tenantId?: string };
}

interface AgentMetric {
  agentId: string;
  fullName: string;
  total: number;
  activeHours: number;
  perActiveHour: number;
  byDisposition: { dispositionId: string; count: number }[];
}

interface OverviewMetrics {
  totalReports: number;
  activeTenants: number;
  pendingFollowups: number;
  agentsOnShift: number;
  byDay: { date: string; count: number }[];
  byTenant: { tenantId: string; name: string; count: number }[];
  byCampaign: { campaignId: string; name: string; count: number }[];
}

describe('Métricas de agentes y overview (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<LoginResponse> {
    const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return res.body as LoginResponse;
  }

  // Rango amplio y fijo (compartido por todos los tests de este archivo)
  // para que la consulta de control vea exactamente los mismos ~200
  // reportes del seed que ve el endpoint.
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  describe('Roles', () => {
    it('client_user -> 403', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');
      await http()
        .get(`/admin/metrics/overview?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await http()
        .get(`/admin/metrics/agents?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('agent -> 403', async () => {
      const { accessToken } = await login('agent1@callreport.demo');
      await http()
        .get(`/admin/metrics/overview?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('supervisor -> 200', async () => {
      const { accessToken } = await login('supervisor@callreport.demo');
      await http()
        .get(`/admin/metrics/overview?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('tz inválido -> 400', async () => {
      const { accessToken } = await login('supervisor@callreport.demo');
      await http()
        .get(`/admin/metrics/overview?from=${from}&to=${to}&tz=No/Existe`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('GET /admin/metrics/agents', () => {
    it('total por agente coincide con COUNT(*) real vía Prisma (consulta de control)', async () => {
      const { accessToken, user: supervisorUser } = await login('supervisor@callreport.demo');

      const res = await http()
        .get(`/admin/metrics/agents?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const body = res.body as AgentMetric[];
      expect(body.length).toBeGreaterThan(0);

      const db = prisma.forUser(supervisorUser);
      for (const agentMetric of body) {
        const controlTotal = await db.callReport.count({
          where: {
            agentId: agentMetric.agentId,
            createdAt: { gte: new Date(from), lt: new Date(to) },
          },
        });
        expect(agentMetric.total).toBe(controlTotal);

        const sumByDisposition = agentMetric.byDisposition.reduce((s, d) => s + d.count, 0);
        expect(sumByDisposition).toBe(agentMetric.total);
      }

      // Todo agente activo aparece, incluso sin reportes en el rango.
      const activeAgents = await db.user.findMany({
        where: { role: Role.agent, status: UserStatus.active },
        select: { id: true },
      });
      expect(body.map((a) => a.agentId).sort()).toEqual(
        activeAgents.map((a) => a.id).sort(),
      );
    });
  });

  describe('GET /admin/metrics/overview', () => {
    it('totalReports/byDay/byTenant/byCampaign coinciden con conteos de control', async () => {
      const { accessToken, user: supervisorUser } = await login('supervisor@callreport.demo');

      const res = await http()
        .get(`/admin/metrics/overview?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const body = res.body as OverviewMetrics;

      const db = prisma.forUser(supervisorUser);
      const controlTotal = await db.callReport.count({
        where: { createdAt: { gte: new Date(from), lt: new Date(to) } },
      });
      expect(body.totalReports).toBe(controlTotal);

      const sumByDay = body.byDay.reduce((s, d) => s + d.count, 0);
      expect(sumByDay).toBe(controlTotal);
      const sumByTenant = body.byTenant.reduce((s, t) => s + t.count, 0);
      expect(sumByTenant).toBe(controlTotal);
      const sumByCampaign = body.byCampaign.reduce((s, c) => s + c.count, 0);
      expect(sumByCampaign).toBe(controlTotal);

      for (const t of body.byTenant) {
        const controlTenantCount = await db.callReport.count({
          where: {
            tenantId: t.tenantId,
            createdAt: { gte: new Date(from), lt: new Date(to) },
          },
        });
        expect(t.count).toBe(controlTenantCount);
      }

      const controlActiveTenants = await db.tenant.count({ where: { status: 'active' } });
      expect(body.activeTenants).toBe(controlActiveTenants);

      const controlPending = await db.callReport.count({
        where: { disposition: { requiresFollowup: true }, followupResolvedAt: null },
      });
      expect(body.pendingFollowups).toBe(controlPending);

      const controlOnShift = await db.shift.count({ where: { endedAt: null } });
      expect(body.agentsOnShift).toBe(controlOnShift);
    });
  });
});
