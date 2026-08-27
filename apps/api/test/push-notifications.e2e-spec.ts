import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PushService } from '../src/notifications/push.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Cubre los criterios de aceptación de Fase 6 (plan.md) relacionados con
// push: registro/baja de tokens (baja lógica -- D1, plan-fase-6.md),
// aislamiento por usuario (push_tokens_self_all), targeting correcto al
// crear un reporte, y limpieza de tokens tras un receipt
// DeviceNotRegistered. PushService está sustituido por un doble (mismo
// motivo que documenta push.service.ts: no queremos pegarle a la API
// real de Expo con tokens de prueba). El envío real a un dispositivo
// físico con la app cerrada queda deferido (D5, plan-fase-6.md): necesita
// un development build de EAS, no Expo Go.
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
}

interface AdminCampaign {
  id: string;
  tenantId: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface PushTokenRow {
  id: string;
  userId: string;
  token: string;
  platform: string;
  revokedAt: string | null;
}

async function waitUntil(
  cond: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs)
      throw new Error('timeout esperando condición');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('Push notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sendAsyncMock: jest.Mock;
  let getReceiptsAsyncMock: jest.Mock;

  beforeAll(async () => {
    sendAsyncMock = jest.fn().mockResolvedValue([]);
    getReceiptsAsyncMock = jest.fn().mockResolvedValue({});

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PushService)
      .useValue({
        enabled: true,
        isValidToken: () => true,
        sendAsync: sendAsyncMock,
        getReceiptsAsync: getReceiptsAsyncMock,
      })
      .compile();

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

  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<LoginResponse> {
    const res = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body as LoginResponse;
  }

  function uniqueToken(seed: string): string {
    return `ExponentPushToken[test-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}]`;
  }

  describe('POST /push/register y DELETE /push/register', () => {
    it('registrar token nuevo -> aparece en push_tokens, activo', async () => {
      const { accessToken, user } = await login('agent1@callreport.demo');
      const { user: supervisorUser } = await login(
        'supervisor@callreport.demo',
      );
      const token = uniqueToken('nuevo');

      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token, platform: 'android' })
        .expect(201);

      const row = await prisma
        .forUser(supervisorUser)
        .pushToken.findUnique({ where: { token } });
      expect(row).not.toBeNull();
      expect((row as PushTokenRow).userId).toBe(user.id);
      expect((row as PushTokenRow).revokedAt).toBeNull();
    });

    it('re-registrar el mismo token hace upsert: reactiva y reasigna dueño (D1)', async () => {
      const { accessToken: agentToken } = await login('agent1@callreport.demo');
      const { accessToken: clientToken, user: clientUser } = await login(
        'client1@acmecorp.demo',
      );
      const { user: supervisorUser } = await login(
        'supervisor@callreport.demo',
      );
      const token = uniqueToken('reasignado');

      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ token, platform: 'android' })
        .expect(201);
      await http()
        .delete('/push/register')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ token })
        .expect(200);

      // Mismo dispositivo, otro usuario logueado después (logout/login) --
      // el upsert reactiva la fila y reasigna el dueño en vez de duplicar.
      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ token, platform: 'ios' })
        .expect(201);

      const rows = await prisma
        .forUser(supervisorUser)
        .pushToken.findMany({ where: { token } });
      expect(rows.length).toBe(1);
      expect(rows[0].userId).toBe(clientUser.id);
      expect(rows[0].revokedAt).toBeNull();
      expect(rows[0].platform).toBe('ios');
    });

    it('DELETE /push/register sella revokedAt -- no borra la fila', async () => {
      const { accessToken, user } = await login('agent1@callreport.demo');
      const { user: supervisorUser } = await login(
        'supervisor@callreport.demo',
      );
      const token = uniqueToken('baja');

      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token, platform: 'android' })
        .expect(201);
      await http()
        .delete('/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token })
        .expect(200);

      const row = (await prisma
        .forUser(supervisorUser)
        .pushToken.findUnique({ where: { token } })) as PushTokenRow;
      expect(row).not.toBeNull();
      expect(row.userId).toBe(user.id);
      expect(row.revokedAt).not.toBeNull();
    });

    it('token con formato inválido -> 400', async () => {
      const { accessToken } = await login('agent1@callreport.demo');
      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token: 'no-es-un-token-expo', platform: 'android' })
        .expect(400);
    });

    it('un usuario no puede dar de baja el token de otro (push_tokens_self_all)', async () => {
      const { accessToken: agentToken } = await login('agent1@callreport.demo');
      const { accessToken: clientToken, user: clientUser } = await login(
        'client1@globex.demo',
      );
      const { user: supervisorUser } = await login(
        'supervisor@callreport.demo',
      );
      const token = uniqueToken('ajeno');

      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ token, platform: 'ios' })
        .expect(201);

      // 200 "ok" (idempotente por diseño), pero 0 filas afectadas: RLS
      // esconde la fila de otro dueño, el token del cliente sigue activo.
      await http()
        .delete('/push/register')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ token })
        .expect(200);

      const row = (await prisma
        .forUser(supervisorUser)
        .pushToken.findUnique({ where: { token } })) as PushTokenRow;
      expect(row.userId).toBe(clientUser.id);
      expect(row.revokedAt).toBeNull();
    });
  });

  describe('Targeting al crear un reporte', () => {
    it('notifica a los client_user del tenant y, si requiere seguimiento, también a supervisores', async () => {
      sendAsyncMock.mockClear();

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
      const followupDisposition = (dispositionsRes.body as Disposition[]).find(
        (d) => d.code === 'seguimiento',
      )!;

      const { accessToken: supervisorToken } = await login(
        'supervisor@callreport.demo',
      );
      const adminCampaignRes = await http()
        .get(`/admin/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      const tenantId = (adminCampaignRes.body as AdminCampaign).tenantId;
      const tenantRes = await http()
        .get(`/admin/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      const tenantName = (tenantRes.body as Tenant).name;
      const ownClientEmail =
        tenantName === 'Acme Corp'
          ? 'client1@acmecorp.demo'
          : 'client1@globex.demo';
      const otherClientEmail =
        tenantName === 'Acme Corp'
          ? 'client1@globex.demo'
          : 'client1@acmecorp.demo';

      const { accessToken: ownClientToken } = await login(ownClientEmail);
      const { accessToken: otherClientToken } = await login(otherClientEmail);

      const ownClientPushToken = uniqueToken('own-client');
      const otherClientPushToken = uniqueToken('other-client');
      const supervisorPushToken = uniqueToken('supervisor');
      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${ownClientToken}`)
        .send({ token: ownClientPushToken, platform: 'android' })
        .expect(201);
      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${otherClientToken}`)
        .send({ token: otherClientPushToken, platform: 'android' })
        .expect(201);
      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ token: supervisorPushToken, platform: 'ios' })
        .expect(201);

      await http()
        .post('/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          campaignId: campaign.id,
          dispositionId: followupDisposition.id,
          contactName: 'Fase6 Push Targeting',
          contactPhone: '555-0400',
        })
        .expect(201);

      // notifyReportCreated() es fire-and-forget (ReportsService.create()):
      // el 201 puede volver antes de que termine. Se espera (con timeout)
      // a que el doble de PushService capture la llamada.
      await waitUntil(() => sendAsyncMock.mock.calls.length > 0, 5000);

      const messages = sendAsyncMock.mock.calls[0][0] as {
        to: string;
        title: string;
      }[];
      const tokensSent = messages.map((m) => m.to);

      expect(tokensSent).toContain(ownClientPushToken);
      expect(tokensSent).toContain(supervisorPushToken);
      expect(tokensSent).not.toContain(otherClientPushToken);

      expect(messages.find((m) => m.to === ownClientPushToken)!.title).toBe(
        'Nuevo reporte de llamada',
      );
      expect(messages.find((m) => m.to === supervisorPushToken)!.title).toBe(
        'Seguimiento pendiente',
      );
    });
  });

  describe('checkReceipts()', () => {
    it('un receipt DeviceNotRegistered da de baja el token (criterio de aceptación 2)', async () => {
      const { accessToken } = await login('agent1@callreport.demo');
      const { user: supervisorUser } = await login(
        'supervisor@callreport.demo',
      );
      const token = uniqueToken('receipt');

      await http()
        .post('/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token, platform: 'android' })
        .expect(201);

      const tokenRow = (await prisma
        .forUser(supervisorUser)
        .pushToken.findUnique({ where: { token } })) as PushTokenRow;
      expect(tokenRow.revokedAt).toBeNull();

      getReceiptsAsyncMock.mockResolvedValueOnce({
        'receipt-1': {
          status: 'error',
          message: 'not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      });

      const notifications = app.get(NotificationsService);
      await notifications.checkReceipts(new Map([['receipt-1', tokenRow.id]]));

      const updated = (await prisma
        .forUser(supervisorUser)
        .pushToken.findUnique({ where: { token } })) as PushTokenRow;
      expect(updated.revokedAt).not.toBeNull();
    });
  });
});
