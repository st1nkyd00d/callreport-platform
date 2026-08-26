import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Corre contra el seed real de la Fase 1 en Neon (ver plan.md Fase 2,
// tarea 5) -- no mockea Prisma ni RLS, porque lo que se está probando es
// precisamente que las políticas de la base hacen su trabajo.
const PASSWORD = 'Password123!';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; tenantId?: string };
}

describe('Aislamiento multi-tenant (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mismo pipe global que main.ts -- Test.createTestingModule no pasa
    // por bootstrap(), así que hay que registrarlo a mano.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
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

  describe('GET /reports', () => {
    it('un client_user de Acme solo ve reportes de Acme, incluso forzando tenantId en la query', async () => {
      const { accessToken, user } = await login('client1@acmecorp.demo');
      expect(user.tenantId).toBeDefined();

      const res = await request(app.getHttpServer())
        .get('/reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.every(
          (r: { tenantId: string }) => r.tenantId === user.tenantId,
        ),
      ).toBe(true);

      // El endpoint no lee tenantId de la query en absoluto -- solo del
      // JWT -- pero se fuerza igual para dejar explícito el criterio de
      // aceptación de Fase 2.
      const forced = await request(app.getHttpServer())
        .get('/reports?tenantId=un-tenant-que-no-existe')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        forced.body.every(
          (r: { tenantId: string }) => r.tenantId === user.tenantId,
        ),
      ).toBe(true);
    });

    it('petición sin token -> 401', async () => {
      await request(app.getHttpServer()).get('/reports').expect(401);
    });
  });

  describe('RolesGuard', () => {
    it('client_user llamando un endpoint de admin -> 403', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');
      await request(app.getHttpServer())
        .get('/admin/ping')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('supervisor sí puede acceder a un endpoint de admin', async () => {
      const { accessToken } = await login('supervisor@callreport.demo');
      await request(app.getHttpServer())
        .get('/admin/ping')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('POST /auth/refresh', () => {
    it('reutilizar un refresh token ya rotado falla (detección de reuso)', async () => {
      const { refreshToken } = await login('client1@acmecorp.demo');

      const first = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(first.body.refreshToken).toBeDefined();
      expect(first.body.refreshToken).not.toBe(refreshToken);

      // Reuso del token viejo (ya rotado por la llamada anterior).
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      // La detección de reuso revoca TODA la familia, incluida la cadena
      // nueva que se acababa de emitir.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);
    });
  });

  describe('ValidationPipe (whitelist + forbidNonWhitelisted)', () => {
    it('body con campos no declarados en el DTO -> 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'client1@acmecorp.demo',
          password: PASSWORD,
          tenantId: 'hack',
        })
        .expect(400);
    });
  });
});
