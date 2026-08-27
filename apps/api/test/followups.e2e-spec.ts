import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

// Cubre el criterio de aceptación de Fase 6 (plan.md): "Flujo de
// seguimiento completo: aparece en pendientes -> resolver -> pasa a
// resueltos con quién y cuándo -> registrado en audit_logs -> el badge se
// actualiza en tiempo real". Corre contra el seed real de Neon, mismo
// criterio que el resto de las suites e2e. app.listen(0) porque se
// necesita un socket real para 'followup.resolved' (ver
// realtime-reports.e2e-spec.ts).
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
}

interface Disposition {
  id: string;
  code: string | null;
  requiresFollowup: boolean;
  requiresSchedule: boolean;
  requiresDetail: boolean;
}

interface Tenant {
  id: string;
  name: string;
}

interface CallReport {
  id: string;
  tenantId: string;
  campaignId: string;
  dispositionId: string;
  followupResolvedAt: string | null;
  followupResolvedBy: string | null;
}

interface FollowupsPage {
  items: CallReport[];
  nextCursor: string | null;
}

describe('Cola de seguimientos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;
  const openSockets: Socket[] = [];

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
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    for (const socket of openSockets) socket.disconnect();
    await app.close();
  });

  function connectSocket(token: string): Socket {
    const socket = io(baseUrl, {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(socket);
    return socket;
  }

  function waitFor(
    socket: Socket,
    event: string,
    timeoutMs = 5000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout esperando '${event}'`)),
        timeoutMs,
      );
      socket.once(event, (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<LoginResponse> {
    const res = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body as LoginResponse;
  }

  // Crea un reporte nuevo con la tipificación 'seguimiento' (requiresFollowup
  // = true, sin campos condicionales -- ver default-dispositions.ts) en la
  // primera campaña asignada al agente de prueba. Todas las campañas del
  // seed llevan el mismo set de 8 tipificaciones por defecto (seed.ts), así
  // que campaigns[0] siempre tiene una con code='seguimiento'.
  async function createFollowupReport(): Promise<CallReport> {
    const { accessToken: agentToken } = await login('agent1@callreport.demo');
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
    const disposition = (dispositionsRes.body as Disposition[]).find(
      (d) => d.code === 'seguimiento',
    )!;
    expect(disposition).toBeDefined();

    const createRes = await http()
      .post('/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        campaignId: campaign.id,
        dispositionId: disposition.id,
        contactName: 'Fase6 Followup Test',
        contactPhone: '555-0300',
      })
      .expect(201);
    return createRes.body as CallReport;
  }

  // Mapea el tenant dueño del reporte a las credenciales de client_user
  // correspondientes -- el seed cruza asignaciones de agentes entre
  // ambos tenants al azar (mismo criterio que realtime-reports.e2e-spec.ts).
  async function clientEmailFor(
    tenantId: string,
  ): Promise<{ own: string; other: string }> {
    const { accessToken: supervisorToken } = await login(
      'supervisor@callreport.demo',
    );
    const tenantRes = await http()
      .get(`/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const tenant = tenantRes.body as Tenant;
    return tenant.name === 'Acme Corp'
      ? { own: 'client1@acmecorp.demo', other: 'client1@globex.demo' }
      : { own: 'client1@globex.demo', other: 'client1@acmecorp.demo' };
  }

  describe('Flujo completo: pendiente -> resuelto -> auditado -> tiempo real', () => {
    it('aparece en pendientes, se resuelve, pasa a resueltos, queda auditado y emite el socket', async () => {
      const report = await createFollowupReport();
      const { own: ownEmail, other: otherEmail } = await clientEmailFor(
        report.tenantId,
      );
      const { accessToken: clientToken, user: clientUser } =
        await login(ownEmail);
      const { accessToken: otherToken } = await login(otherEmail);

      // 1. Aparece en pendientes (para el cliente dueño).
      const pendingRes = await http()
        .get('/followups?status=pending&limit=100')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const pendingBody = pendingRes.body as FollowupsPage;
      expect(pendingBody.items.some((r) => r.id === report.id)).toBe(true);

      const countBefore = await http()
        .get('/followups/count')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      expect((countBefore.body as { pending: number }).pending).toBeGreaterThan(
        0,
      );

      // 2. El cliente del OTRO tenant no lo ve ni puede resolverlo (404 --
      // RLS lo esconde antes de que el servicio pueda distinguir "no
      // existe" de "no es tuyo").
      await http()
        .post(`/followups/${report.id}/resolve`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      // 3. Resolver -- listener del socket registrado ANTES de disparar
      // el POST (gotcha de timing documentado en la Fase 5: el server
      // emite antes de que la respuesta HTTP del propio request vuelva).
      const ownSocket = connectSocket(clientToken);
      await waitFor(ownSocket, 'connect');
      const resolvedEvent = waitFor(ownSocket, 'followup.resolved');

      const resolveRes = await http()
        .post(`/followups/${report.id}/resolve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(201);
      const resolved = resolveRes.body as CallReport;
      expect(resolved.followupResolvedAt).not.toBeNull();
      expect(resolved.followupResolvedBy).toBe(clientUser.id);

      const socketPayload = (await resolvedEvent) as CallReport;
      expect(socketPayload.id).toBe(report.id);

      // 4. Auditado con action='resolve_followup'. audit_logs tiene RLS
      // desde Fase 7 (audit_logs_staff_select) -- se lee con contexto de
      // staff, la política solo mira el rol.
      const logs = await prisma
        .forUser({ id: 'audit-reader', role: Role.super_admin })
        .auditLog.findMany({
          where: {
            entityType: 'CallReport',
            entityId: report.id,
            action: 'resolve_followup',
          },
          orderBy: { createdAt: 'desc' },
        });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].userId).toBe(clientUser.id);

      // 5. Pasa a resueltos, badge de pendientes baja.
      const resolvedListRes = await http()
        .get('/followups?status=resolved&limit=100')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      expect(
        (resolvedListRes.body as FollowupsPage).items.some(
          (r) => r.id === report.id,
        ),
      ).toBe(true);

      const pendingAfterRes = await http()
        .get('/followups?status=pending&limit=100')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      expect(
        (pendingAfterRes.body as FollowupsPage).items.some(
          (r) => r.id === report.id,
        ),
      ).toBe(false);

      const countAfter = await http()
        .get('/followups/count')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      expect((countAfter.body as { pending: number }).pending).toBe(
        (countBefore.body as { pending: number }).pending - 1,
      );

      // 6. Resolverlo de nuevo -> 409 (idempotencia explícita).
      await http()
        .post(`/followups/${report.id}/resolve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(409);
    });
  });

  describe('Validaciones', () => {
    it('tipificación que no requiere seguimiento -> 400', async () => {
      const { accessToken: agentToken } = await login('agent1@callreport.demo');
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
      const noFollowup = (dispositionsRes.body as Disposition[]).find(
        (d) => !d.requiresFollowup && !d.requiresSchedule && !d.requiresDetail,
      )!;

      const createRes = await http()
        .post('/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          campaignId: campaign.id,
          dispositionId: noFollowup.id,
          contactName: 'Fase6 Sin Seguimiento',
          contactPhone: '555-0301',
        })
        .expect(201);
      const report = createRes.body as CallReport;

      const { own: ownEmail } = await clientEmailFor(report.tenantId);
      const { accessToken: clientToken } = await login(ownEmail);
      await http()
        .post(`/followups/${report.id}/resolve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(400);
    });

    it('un agente no puede acceder a la cola de seguimientos -> 403', async () => {
      const { accessToken: agentToken } = await login('agent1@callreport.demo');
      await http()
        .get('/followups?status=pending')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);
    });

    it('status inválido -> 400', async () => {
      const { accessToken: clientToken } = await login('client1@acmecorp.demo');
      await http()
        .get('/followups?status=lo-que-sea')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(400);
    });

    it('el trigger de RLS bloquea que un client_user toque otras columnas', async () => {
      const report = await createFollowupReport();
      const { own: ownEmail } = await clientEmailFor(report.tenantId);
      const { user: clientUser } = await login(ownEmail);

      await expect(
        prisma
          .forUser({
            id: clientUser.id,
            role: Role.client_user,
            tenantId: clientUser.tenantId,
          })
          .callReport.update({
            where: { id: report.id },
            data: { notes: 'hackeado' },
          }),
      ).rejects.toThrow();
    });
  });
});
