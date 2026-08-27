import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

// Cubre el criterio de aceptación de Fase 7 (plan.md): "el visor de
// auditoría muestra los eventos de todas las fases anteriores; sigue
// siendo imposible modificar audit_logs (re-verificar REVOKE)". También
// cubre la migración 20260827030333_audit_logs_rls (D4 de
// plan-fase-7.md): 403 por rol, y la regresión más importante -- que
// encender RLS en audit_logs no rompió el INSERT de auditoría de ningún
// rol (ver el gotcha de INSERT...RETURNING documentado en
// audit.interceptor.ts).
const PASSWORD = 'Password123!';

jest.setTimeout(30000);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; tenantId?: string };
}

interface AgentCampaign {
  id: string;
}

interface Disposition {
  id: string;
  code: string | null;
  requiresSchedule: boolean;
  requiresDetail: boolean;
}

interface CallReport {
  id: string;
  tenantId: string;
}

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

interface AuditLogsPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
}

describe('Visor de auditoría (e2e)', () => {
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

  // El seed cruza asignaciones de agentes entre tenants al azar -- mismo
  // criterio que realtime-reports.e2e-spec.ts / followups.e2e-spec.ts.
  async function clientEmailFor(tenantId: string, supervisorToken: string): Promise<string> {
    const tenantRes = await http()
      .get(`/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const tenant = tenantRes.body as { name: string };
    const domain = tenant.name.toLowerCase().includes('acme') ? 'acmecorp' : 'globex';
    return `client1@${domain}.demo`;
  }

  describe('Roles', () => {
    it('client_user -> 403', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');
      await http()
        .get('/admin/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('agent -> 403', async () => {
      const { accessToken } = await login('agent1@callreport.demo');
      await http()
        .get('/admin/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('supervisor -> 200', async () => {
      const { accessToken } = await login('supervisor@callreport.demo');
      await http()
        .get('/admin/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Paginación por cursor', () => {
    it('varias páginas de a 5 reconstruyen exactamente la misma lista que una sola página grande', async () => {
      const { accessToken } = await login('supervisor@callreport.demo');

      const bigPageRes = await http()
        .get('/admin/audit-logs?limit=20')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const bigPage = bigPageRes.body as AuditLogsPage;
      expect(bigPage.items.length).toBeGreaterThan(10);

      const collected: AuditLogEntry[] = [];
      let after: string | undefined;
      for (let i = 0; i < 4 && collected.length < bigPage.items.length; i++) {
        const res = await http()
          .get(`/admin/audit-logs?limit=5${after ? `&after=${after}` : ''}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        const page = res.body as AuditLogsPage;
        collected.push(...page.items);
        if (!page.nextCursor) break;
        after = page.nextCursor;
      }

      expect(collected.map((l) => l.id)).toEqual(
        bigPage.items.slice(0, collected.length).map((l) => l.id),
      );
    });
  });

  // Flujo self-contained: turno -> crear reporte (create) -> editar
  // (update) -> tipificación con seguimiento -> resolver (resolve_followup),
  // más una mutación de admin (Tenant create, Fase 3) independiente.
  // Verifica el criterio "eventos de todas las fases anteriores".
  describe('Cobertura de fases anteriores + inmutabilidad', () => {
    it('acciones de Fase 3/4/6 aparecen en el visor; UPDATE/DELETE siguen prohibidos', async () => {
      const { accessToken: agentToken, user: agent } = await login('agent1@callreport.demo');
      const { accessToken: adminToken, user: admin } = await login('admin@callreport.demo');
      const { accessToken: supervisorToken } = await login('supervisor@callreport.demo');

      await http()
        .post('/agent/shifts/clock-in')
        .set('Authorization', `Bearer ${agentToken}`)
        .then((res) => expect([201, 409]).toContain(res.status));

      const campaignsRes = await http()
        .get('/agent/campaigns')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const campaign = (campaignsRes.body as AgentCampaign[])[0];

      const dispositionsRes = await http()
        .get(`/campaigns/${campaign.id}/dispositions`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const dispositions = dispositionsRes.body as Disposition[];
      const followupDisposition = dispositions.find((d) => d.code === 'seguimiento')!;
      expect(followupDisposition).toBeDefined();

      // Fase 4: create.
      const createRes = await http()
        .post('/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          campaignId: campaign.id,
          dispositionId: followupDisposition.id,
          contactName: 'Fase7 Audit Viewer Test',
          contactPhone: '555-0400',
        })
        .expect(201);
      const report = createRes.body as CallReport;

      // Fase 4: update (dentro de la ventana de edición).
      await http()
        .patch(`/reports/${report.id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ notes: 'Editado para el visor de auditoría' })
        .expect(200);

      // Fase 6: resolve_followup (por un client_user del tenant dueño).
      const clientEmail = await clientEmailFor(report.tenantId, supervisorToken);
      const { accessToken: clientToken } = await login(clientEmail);
      await http()
        .post(`/followups/${report.id}/resolve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(201);

      // Fase 3: mutación de admin independiente (Tenant create).
      const tenantRes = await http()
        .post('/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Fase7 Audit Viewer ${randomUUID().slice(0, 8)}` })
        .expect(201);
      const tenant = tenantRes.body as { id: string };

      // Las 4 acciones aparecen filtrando por entidad.
      const reportLogsRes = await http()
        .get(`/admin/audit-logs?entityType=CallReport&limit=50`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      const reportLogs = (reportLogsRes.body as AuditLogsPage).items.filter(
        (l) => l.entityId === report.id,
      );
      const actionsForReport = reportLogs.map((l) => l.action).sort();
      expect(actionsForReport).toEqual(['create', 'resolve_followup', 'update']);

      const tenantLogsRes = await http()
        .get(`/admin/audit-logs?entityType=Tenant&limit=50`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      const tenantLog = (tenantLogsRes.body as AuditLogsPage).items.find(
        (l) => l.entityId === tenant.id,
      );
      expect(tenantLog).toBeDefined();
      expect(tenantLog!.action).toBe('create');
      expect(tenantLog!.userId).toBe(admin.id);

      // Filtro por userId contrastado contra count() de Prisma.
      const controlCount = await prisma
        .forUser({ id: admin.id, role: Role.super_admin })
        .auditLog.count({ where: { userId: agent.id } });
      const filteredRes = await http()
        .get(`/admin/audit-logs?userId=${agent.id}&limit=100`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      expect((filteredRes.body as AuditLogsPage).items.length).toBe(
        Math.min(controlCount, 100),
      );

      // Regresión de RLS (D4): el INSERT de auditoría del agente (fila
      // 'create' de arriba) existe -- si audit_logs_self_insert faltara,
      // el POST /reports habría devuelto 500 (ver el gotcha documentado
      // en audit.interceptor.ts), no habría llegado hasta acá.
      expect(reportLogs.some((l) => l.action === 'create' && l.userId === agent.id)).toBe(true);

      // Inmutabilidad: UPDATE/DELETE siguen prohibidos incluso para staff.
      const staffDb = prisma.forUser({ id: admin.id, role: Role.super_admin });
      await expect(
        staffDb.auditLog.update({ where: { id: tenantLog!.id }, data: { action: 'x' } }),
      ).rejects.toThrow();
      await expect(
        staffDb.auditLog.delete({ where: { id: tenantLog!.id } }),
      ).rejects.toThrow();
    });
  });
});
