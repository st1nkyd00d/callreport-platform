import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Cubre el criterio de aceptación de Fase 3 (plan.md): flujo completo
// tenant -> campaña -> tipificaciones -> agentes -> client_user, cada
// mutación auditada, y el control de roles (supervisor no crea tenants).
const PASSWORD = 'Password123!';

// Flujo largo con muchos round-trips secuenciales contra Neon -- el
// timeout default de Jest (5s) no alcanza.
jest.setTimeout(30000);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; tenantId?: string };
}

describe('CRUD de administración (e2e)', () => {
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

  async function assertAudited(
    entityType: string,
    entityId: string,
    userId: string,
  ) {
    const logs = await prisma.auditLog.findMany({
      where: { entityType, entityId },
    });
    expect(logs.length).toBeGreaterThan(0);
    const log = logs[logs.length - 1];
    expect(log.userId).toBe(userId);
    expect(log.diff).toBeTruthy();
  }

  it('flujo completo: tenant -> campaña -> tipificaciones -> agentes -> client_user, todo auditado', async () => {
    const { accessToken: adminToken, user: admin } = await login(
      'admin@callreport.demo',
    );
    const suffix = randomUUID().slice(0, 8);

    // 1. Crear tenant (super_admin).
    const tenantRes = await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Fase3 Test ${suffix}` })
      .expect(201);
    const tenant = tenantRes.body as { id: string; name: string };
    await assertAudited('Tenant', tenant.id, admin.id);

    // Supervisor NO puede crear tenants.
    const { accessToken: supervisorToken, user: supervisor } = await login(
      'supervisor@callreport.demo',
    );
    await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ name: 'No debería crearse' })
      .expect(403);

    // 2. Crear campaña (supervisor sí puede) -> 8 tipificaciones por defecto.
    const campaignRes = await request(app.getHttpServer())
      .post('/admin/campaigns')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ name: `Campaña ${suffix}`, tenantId: tenant.id })
      .expect(201);
    const campaign = campaignRes.body as {
      id: string;
      dispositionsCount: number;
    };
    expect(campaign.dispositionsCount).toBe(8);
    await assertAudited('Campaign', campaign.id, supervisor.id);

    const dispositionsRes = await request(app.getHttpServer())
      .get(`/admin/campaigns/${campaign.id}/dispositions`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const dispositions = dispositionsRes.body as { id: string }[];
    expect(dispositions).toHaveLength(8);

    // 3. Editar 3 tipificaciones.
    for (const disposition of dispositions.slice(0, 3)) {
      await request(app.getHttpServer())
        .patch(`/admin/campaigns/${campaign.id}/dispositions/${disposition.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ requiresFollowup: true })
        .expect(200);
      await assertAudited('Disposition', disposition.id, supervisor.id);
    }

    // 4. Crear 2 agentes (solo super_admin crea usuarios) y asignarlos.
    const agentIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const agentRes = await request(app.getHttpServer())
        .post('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: `Agente Fase3 ${suffix}-${i}`,
          email: `agente.fase3.${suffix}.${i}@callreport.demo`,
          password: PASSWORD,
          role: 'agent',
        })
        .expect(201);
      agentIds.push((agentRes.body as { id: string }).id);
      await assertAudited('User', agentRes.body.id as string, admin.id);
    }

    const withAgentsRes = await request(app.getHttpServer())
      .put(`/admin/campaigns/${campaign.id}/agents`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ agentIds })
      .expect(200);
    expect(
      (withAgentsRes.body as { agentIds: string[] }).agentIds.sort(),
    ).toEqual([...agentIds].sort());
    await assertAudited('Campaign', campaign.id, supervisor.id);

    // 5. Crear client_user del tenant nuevo.
    const clientRes = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: `Cliente Fase3 ${suffix}`,
        email: `cliente.fase3.${suffix}@callreport.demo`,
        password: PASSWORD,
        role: 'client_user',
        tenantId: tenant.id,
      })
      .expect(201);
    expect((clientRes.body as { tenantId?: string }).tenantId).toBe(tenant.id);
    await assertAudited('User', clientRes.body.id as string, admin.id);

    // Persiste tras "recargar" (un GET nuevo, no el objeto en memoria).
    const reloadedTenants = await request(app.getHttpServer())
      .get('/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (reloadedTenants.body as { id: string }[]).some(
        (t) => t.id === tenant.id,
      ),
    ).toBe(true);
  });

  it('POST /admin/users con role client_user sin tenantId -> 400', async () => {
    const { accessToken } = await login('admin@callreport.demo');
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'Sin tenant',
        email: `sin.tenant.${randomUUID().slice(0, 8)}@callreport.demo`,
        password: PASSWORD,
        role: 'client_user',
      })
      .expect(400);
  });
});
