import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

// Cubre el criterio de aceptación de Fase 4 (plan.md): un agente crea un
// reporte en menos de 30s de interacción, con tenant_id/shift_id
// derivados en el servidor, aislado por campaña, y con ventana de
// edición de 30 min. Corre contra el seed real de Neon (mismo criterio
// que admin-crud.e2e-spec.ts / isolation.e2e-spec.ts).
const PASSWORD = 'Password123!';

jest.setTimeout(30000);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; tenantId?: string };
}

interface AgentCampaign {
  id: string;
  name: string;
  tenant: { name: string };
}

interface Disposition {
  id: string;
  campaignId: string;
  requiresSchedule: boolean;
  requiresDetail: boolean;
}

interface AdminCampaign {
  id: string;
  tenantId: string;
  agentIds: string[];
}

interface Shift {
  id: string;
  endedAt: string | null;
}

interface CallReport {
  id: string;
  tenantId: string;
  campaignId: string;
  shiftId: string | null;
  createdAt: string;
}

describe('Flujo del agente: reportes y turnos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string): Promise<LoginResponse> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body as LoginResponse;
  }

  // audit_logs tiene RLS desde Fase 7 (audit_logs_staff_select) -- una
  // lectura sin contexto de sesión ve 0 filas, igual que cualquier otra
  // tabla con RLS. La política solo mira el rol, así que cualquier
  // identidad de staff alcanza para leer.
  const auditReader = { id: 'audit-reader', role: Role.super_admin };

  async function assertAudited(entityType: string, entityId: string, userId: string) {
    const logs = await prisma.forUser(auditReader).auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].userId).toBe(userId);
  }

  it('flujo completo: turno, crear reporte, aislamiento por campaña, edición y ventana', async () => {
    const { accessToken: agentToken, user: agent } = await login('agent1@callreport.demo');
    const { accessToken: supervisorToken, user: supervisor } = await login(
      'supervisor@callreport.demo',
    );
    const http = () => request(app.getHttpServer());

    // 1. Turno: clock-in (tolerar 409 si el seed ya dejó uno abierto).
    await http()
      .post('/agent/shifts/clock-in')
      .set('Authorization', `Bearer ${agentToken}`)
      .then((res) => expect([201, 409]).toContain(res.status));

    const currentRes = await http()
      .get('/agent/shifts/current')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const openShift = currentRes.body as Shift;
    expect(openShift).not.toBeNull();
    expect(openShift.endedAt).toBeNull();

    // 2. Campaña asignada + tipificación sin campos condicionales.
    const campaignsRes = await http()
      .get('/agent/campaigns')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const campaigns = campaignsRes.body as AgentCampaign[];
    expect(campaigns.length).toBeGreaterThan(0);
    const campaign = campaigns[0];

    const dispositionsRes = await http()
      .get(`/campaigns/${campaign.id}/dispositions`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const dispositions = dispositionsRes.body as Disposition[];
    const simpleDisposition = dispositions.find(
      (d) => !d.requiresSchedule && !d.requiresDetail,
    )!;
    expect(simpleDisposition).toBeDefined();

    // 3. Crear reporte en campaña asignada -> 201, tenant_id/shift_id
    //    derivados en servidor.
    const adminCampaignRes = await http()
      .get(`/admin/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const adminCampaign = adminCampaignRes.body as AdminCampaign;

    const createRes = await http()
      .post('/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        campaignId: campaign.id,
        dispositionId: simpleDisposition.id,
        contactName: 'Fase4 Test',
        contactPhone: '555-0100',
        notes: 'Reporte de prueba e2e <b>con html</b>',
      })
      .expect(201);
    const report = createRes.body as CallReport;
    expect(report.tenantId).toBe(adminCampaign.tenantId);
    expect(report.shiftId).toBe(openShift.id);
    await assertAudited('CallReport', report.id, agent.id);

    // 4. Campaña NO asignada -> 403 (campaign_agents no tiene RLS, así
    //    que esto es distinguible de un id inexistente -- ver comentario
    //    en ReportsService.create()).
    const allCampaignsRes = await http()
      .get('/admin/campaigns')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const allCampaigns = allCampaignsRes.body as AdminCampaign[];
    const unassignedCampaign = allCampaigns.find((c) => !c.agentIds.includes(agent.id));
    expect(unassignedCampaign).toBeDefined();

    await http()
      .post('/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        campaignId: unassignedCampaign!.id,
        dispositionId: simpleDisposition.id,
        contactName: 'No debería crearse',
        contactPhone: '555-0101',
      })
      .expect(403);

    // 5. Tipificación de otra campaña -> 400.
    const otherDispositionsRes = await http()
      .get(`/campaigns/${unassignedCampaign!.id}/dispositions`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const otherDisposition = (otherDispositionsRes.body as Disposition[])[0];

    await http()
      .post('/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        campaignId: campaign.id,
        dispositionId: otherDisposition.id,
        contactName: 'Tipificación cruzada',
        contactPhone: '555-0102',
      })
      .expect(400);

    // 6. Body con tenantId inyectado -> 400 (ValidationPipe whitelist).
    await http()
      .post('/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        campaignId: campaign.id,
        dispositionId: simpleDisposition.id,
        contactName: 'Inyección de tenant',
        contactPhone: '555-0103',
        tenantId: 'not-my-tenant',
      })
      .expect(400);

    // 7. Sin turno abierto -> 409; luego se restaura el turno para no
    //    dejar al agente sin turno para el resto de la suite.
    await http()
      .post('/agent/shifts/clock-out')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(201);

    await http()
      .post('/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        campaignId: campaign.id,
        dispositionId: simpleDisposition.id,
        contactName: 'Sin turno',
        contactPhone: '555-0104',
      })
      .expect(409);

    await http()
      .post('/agent/shifts/clock-in')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(201);

    // 8. PATCH dentro de la ventana por el autor -> 200.
    await http()
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ notes: 'Editado dentro de la ventana' })
      .expect(200);
    await assertAudited('CallReport', report.id, agent.id);

    // 9. Retroceder created_at 31 min (vía forUser(supervisor), que sí
    //    puede UPDATE por call_reports_staff_all -- el `prisma` de este
    //    test conecta como app_user/RLS, un update directo sin contexto
    //    afectaría 0 filas).
    const backdated = new Date(Date.now() - 31 * 60_000);
    await prisma
      .forUser({ id: supervisor.id, role: Role.supervisor })
      .callReport.update({ where: { id: report.id }, data: { createdAt: backdated } });

    await http()
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ notes: 'No debería aplicarse' })
      .expect(403);

    await http()
      .patch(`/reports/${report.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ notes: 'Editado por supervisor fuera de ventana' })
      .expect(200);
    await assertAudited('CallReport', report.id, supervisor.id);
  });
});
