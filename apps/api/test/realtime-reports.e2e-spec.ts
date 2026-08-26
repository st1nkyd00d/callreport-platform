import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Cubre el criterio de aceptación de Fase 5 (plan.md): el gateway de
// Socket.io deriva el room SOLO del JWT (nunca de lo que pida el
// cliente), GET /reports con filtros + cursor, y GET /reports/summary.
// Corre contra el seed real de Neon, mismo criterio que las suites
// anteriores. app.listen(0) es necesario acá (a diferencia del resto):
// socket.io-client necesita una URL real para conectar, supertest no
// alcanza.
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
  campaignId: string;
  requiresSchedule: boolean;
  requiresDetail: boolean;
}

interface CallReport {
  id: string;
  tenantId: string;
  campaignId: string;
  dispositionId: string;
  createdAt: string;
}

describe('Tiempo real: sockets y GET /reports (e2e)', () => {
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

  function connectSocket(token?: string): Socket {
    const socket = io(baseUrl, {
      path: '/ws',
      auth: token !== undefined ? { token } : {},
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

  async function login(email: string): Promise<LoginResponse> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body as LoginResponse;
  }

  describe('Autenticación del gateway', () => {
    it('conexión sin token -> desconectada', async () => {
      const socket = connectSocket();
      await expect(waitFor(socket, 'disconnect')).resolves.toBeDefined();
    });

    it('conexión con JWT inválido -> desconectada', async () => {
      const socket = connectSocket('token-invalido-no-es-un-jwt');
      await expect(waitFor(socket, 'disconnect')).resolves.toBeDefined();
    });
  });

  describe('Aislamiento por tenant en tiempo real', () => {
    it('un reporte nuevo llega solo al cliente de su propio tenant, no al del otro', async () => {
      const { accessToken: agentToken } = await login('agent1@callreport.demo');
      const { accessToken: acmeToken, user: acmeUser } = await login(
        'client1@acmecorp.demo',
      );
      const { accessToken: globexToken, user: globexUser } = await login(
        'client1@globex.demo',
      );
      const http = () => request(app.getHttpServer());

      const acmeSocket = connectSocket(acmeToken);
      const globexSocket = connectSocket(globexToken);
      await Promise.all([
        waitFor(acmeSocket, 'connect'),
        waitFor(globexSocket, 'connect'),
      ]);

      // Un solo listener por socket, registrado ANTES de crear el
      // reporte: el evento se emite en el servidor antes de que la
      // respuesta HTTP del POST vuelva al test, así que un waitFor()
      // registrado DESPUÉS del create llegaría tarde (el evento, al ser
      // once, ya se habría disparado y consumido). Sin timeout interno
      // acá a propósito -- el socket que NO debería recibir nada nunca
      // resuelve, y no hace falta que rechace (eso generaría un
      // unhandled rejection ruidoso de fondo).
      let acmeReceived: CallReport | undefined;
      let globexReceived: CallReport | undefined;
      const acmeEvent = new Promise<CallReport>((resolve) =>
        acmeSocket.once('report.created', (r: CallReport) => {
          acmeReceived = r;
          resolve(r);
        }),
      );
      const globexEvent = new Promise<CallReport>((resolve) =>
        globexSocket.once('report.created', (r: CallReport) => {
          globexReceived = r;
          resolve(r);
        }),
      );

      // Turno abierto (tolerar 409 si el seed ya dejó uno).
      await http()
        .post('/agent/shifts/clock-in')
        .set('Authorization', `Bearer ${agentToken}`)
        .then((res) => expect([201, 409]).toContain(res.status));

      const campaignsRes = await http()
        .get('/agent/campaigns')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      // El seed asigna agentes a campañas cruzando ambos tenants al azar
      // -- se usa la primera campaña asignada, sea de Acme o de Globex,
      // y se determina después de crear el reporte cuál room debía
      // recibirlo.
      const campaign = (campaignsRes.body as AgentCampaign[])[0];

      const dispositionsRes = await http()
        .get(`/campaigns/${campaign.id}/dispositions`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const disposition = (dispositionsRes.body as Disposition[]).find(
        (d) => !d.requiresSchedule && !d.requiresDetail,
      )!;

      const createRes = await http()
        .post('/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          campaignId: campaign.id,
          dispositionId: disposition.id,
          contactName: 'Fase5 Realtime Test',
          contactPhone: '555-0200',
        })
        .expect(201);
      const report = createRes.body as CallReport;

      const isAcme = report.tenantId === acmeUser.tenantId;
      const isGlobex = report.tenantId === globexUser.tenantId;
      expect(isAcme || isGlobex).toBe(true);

      const ownerEvent = isAcme ? acmeEvent : globexEvent;
      const timeout = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 2000),
      );
      const received = await Promise.race([ownerEvent, timeout]);
      expect(received).not.toBe('timeout');
      expect((received as CallReport).id).toBe(report.id);
      expect((received as CallReport).tenantId).toBe(report.tenantId);

      // Margen para que un evento indebido al otro tenant, si existiera,
      // tuviera tiempo de llegar antes de aserir que no llegó.
      await new Promise((r) => setTimeout(r, 200));
      const otherReceived = isAcme ? globexReceived : acmeReceived;
      expect(otherReceived).toBeUndefined();
    });
  });

  describe('GET /reports — filtros y cursor', () => {
    it('from/to + dispositionId coincide con una consulta de control vía Prisma', async () => {
      const { accessToken, user } = await login('client1@acmecorp.demo');
      const http = () => request(app.getHttpServer());

      const from = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const to = new Date().toISOString();

      const controlCount = await prisma.forUser(user).callReport.count({
        where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
      });

      // Paginar con cursor hasta agotar y comparar el total contra la
      // consulta de control.
      let total = 0;
      let after: string | undefined;
      for (let i = 0; i < 50; i++) {
        const res = await http()
          .get(
            `/reports?from=${from}&to=${to}&limit=25${after ? `&after=${after}` : ''}`,
          )
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        const body = res.body as {
          items: CallReport[];
          nextCursor: string | null;
        };
        total += body.items.length;
        expect(body.items.every((r) => r.tenantId === user.tenantId)).toBe(
          true,
        );
        if (!body.nextCursor) break;
        after = body.nextCursor;
      }

      expect(total).toBe(controlCount);
    });

    it('fecha malformada -> 400', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');
      await request(app.getHttpServer())
        .get('/reports?from=no-es-una-fecha')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('GET /reports/summary', () => {
    it('la suma de byDisposition coincide con total y con el conteo real', async () => {
      const { accessToken, user } = await login('client1@acmecorp.demo');
      const http = () => request(app.getHttpServer());

      const res = await http()
        .get('/reports/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const body = res.body as {
        total: number;
        byDisposition: { count: number }[];
      };

      const sum = body.byDisposition.reduce((s, d) => s + d.count, 0);
      expect(sum).toBe(body.total);

      const controlCount = await prisma.forUser(user).callReport.count();
      expect(body.total).toBe(controlCount);
    });
  });

  describe('GET /reports/:id', () => {
    it('detalle de un reporte propio del tenant', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');
      const http = () => request(app.getHttpServer());

      const listRes = await http()
        .get('/reports?limit=1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const first = (listRes.body as { items: CallReport[] }).items[0];

      const detailRes = await http()
        .get(`/reports/${first.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detailRes.body.id).toBe(first.id);
    });

    it('id de un reporte de otro tenant -> 404', async () => {
      const { accessToken: globexToken } = await login('client1@globex.demo');
      const { accessToken: acmeToken } = await login('client1@acmecorp.demo');
      const http = () => request(app.getHttpServer());

      const acmeListRes = await http()
        .get('/reports?limit=1')
        .set('Authorization', `Bearer ${acmeToken}`)
        .expect(200);
      const acmeReport = (acmeListRes.body as { items: CallReport[] }).items[0];

      await http()
        .get(`/reports/${acmeReport.id}`)
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(404);
    });
  });
});
