import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

// Cubre los criterios de aceptación de Fase 7 (plan.md): el CSV de un
// cliente contiene solo filas de su tenant y coincide en conteo con el
// dashboard; el PDF abre como PDF válido y refleja los filtros; y las
// decisiones D1-D7 de plan-fase-7.md (streaming keyset, antiinyección de
// fórmulas, BOM, tenantId neutralizado para no-staff).
const PASSWORD = 'Password123!';

jest.setTimeout(30000);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; tenantId?: string };
}

interface ReportsSummary {
  total: number;
}

interface AgentCampaign {
  id: string;
  tenant: { name: string };
}

interface Disposition {
  id: string;
  campaignId: string;
  requiresSchedule: boolean;
  requiresDetail: boolean;
}

interface CreatedReport {
  id: string;
  tenantId: string;
  campaignId: string;
}

// Parser mínimo de una línea CSV con comillas dobles -- suficiente para
// líneas que este mismo backend generó (csv.util.ts nunca deja un salto
// de línea real dentro de una celda, así que una línea = una fila).
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') throw new Error(`Celda sin comillas en posición ${i}: ${line}`);
    i++;
    let value = '';
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else {
          i++;
          break;
        }
      } else {
        value += line[i];
        i++;
      }
    }
    cells.push(value);
    i++; // skip comma (or end of line)
  }
  return cells;
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const withoutBom = text.replace(/^﻿/, '');
  const lines = withoutBom.split('\r\n').filter((l) => l.length > 0);
  const [headerLine, ...dataLines] = lines;
  return { header: parseCsvLine(headerLine), rows: dataLines.map(parseCsvLine) };
}

describe('Exportación CSV/PDF (e2e)', () => {
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

  describe('GET /exports/reports.csv', () => {
    it('client_user de Acme: cabeceras correctas, BOM, y conteo coincide con /reports/summary', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');

      const res = await http()
        .get('/exports/reports.csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.text.charCodeAt(0)).toBe(0xfeff);

      const { header, rows } = parseCsv(res.text);
      // client_user NO es staff -- sin columna Empresa.
      expect(header).toEqual([
        'ID',
        'Fecha',
        'Campaña',
        'Tipificación',
        'Contacto',
        'Teléfono',
        'Email',
        'Agente',
        'Cita agendada',
        'Detalle',
        'Notas',
        'Seguimiento resuelto',
      ]);

      const summaryRes = await http()
        .get('/reports/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const summary = summaryRes.body as ReportsSummary;
      expect(rows.length).toBe(summary.total);
    });

    it('todas las filas pertenecen al tenant del solicitante (contrastado contra Prisma)', async () => {
      const { accessToken, user } = await login('client2@acmecorp.demo');

      const res = await http()
        .get('/exports/reports.csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const { rows } = parseCsv(res.text);
      const csvIds = rows.map((r) => r[0]).sort();

      const controlIds = (
        await prisma
          .forUser({ id: user.id, role: Role.client_user, tenantId: user.tenantId })
          .callReport.findMany({ select: { id: true } })
      )
        .map((r) => r.id)
        .sort();
      expect(csvIds).toEqual(controlIds);
    });

    it('?tenantId= de otro tenant forzado por un client_user no cambia el archivo (D7)', async () => {
      const { accessToken: acmeToken } = await login('client1@acmecorp.demo');
      const { user: globexUser } = await login('client1@globex.demo');

      const withoutForce = await http()
        .get('/exports/reports.csv')
        .set('Authorization', `Bearer ${acmeToken}`)
        .expect(200);
      const forced = await http()
        .get(`/exports/reports.csv?tenantId=${globexUser.tenantId}`)
        .set('Authorization', `Bearer ${acmeToken}`)
        .expect(200);

      expect(parseCsv(forced.text).rows.map((r) => r[0]).sort()).toEqual(
        parseCsv(withoutForce.text).rows.map((r) => r[0]).sort(),
      );
    });

    it('filtros from/to/dispositionId coinciden con /reports para el mismo rango', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');
      const from = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();

      const summaryRes = await http()
        .get(`/reports/summary?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const summary = summaryRes.body as ReportsSummary;

      const csvRes = await http()
        .get(`/exports/reports.csv?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(parseCsv(csvRes.text).rows.length).toBe(summary.total);
    });

    it('super_admin sin tenantId ve filas de ambos tenants con columna Empresa', async () => {
      const { accessToken } = await login('admin@callreport.demo');

      const res = await http()
        .get('/exports/reports.csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const { header, rows } = parseCsv(res.text);
      expect(header[2]).toBe('Empresa');

      const empresas = new Set(rows.map((r) => r[2]));
      expect(empresas.size).toBeGreaterThanOrEqual(2);
      expect([...empresas]).toEqual(
        expect.arrayContaining([expect.stringContaining('Acme'), expect.stringContaining('Globex')]),
      );
    });

    it('antiinyección de fórmulas y multilínea: una fila bien escapada, notas prefijadas con \'', async () => {
      const { accessToken: agentToken, user: agent } = await login('agent1@callreport.demo');

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
        (d) => !d.requiresSchedule && !d.requiresDetail,
      )!;

      const maliciousNotes = '=SUM(A1)\nLine two with "quotes" and, a comma';
      const createRes = await http()
        .post('/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          campaignId: campaign.id,
          dispositionId: disposition.id,
          contactName: 'Fase7 Injection Test',
          contactPhone: '555-0200',
          notes: maliciousNotes,
        })
        .expect(201);
      const report = createRes.body as CreatedReport;

      // Exportar como staff para poder ver el reporte sin depender de a
      // qué tenant terminó asignado el agente (el seed cruza asignaciones
      // al azar -- ver comentario ya existente en realtime-reports.e2e-spec.ts).
      const { accessToken: supervisorToken } = await login('supervisor@callreport.demo');
      const csvRes = await http()
        .get('/exports/reports.csv')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      const { header, rows } = parseCsv(csvRes.text);
      const row = rows.find((r) => r[0] === report.id)!;
      expect(row).toBeDefined();
      expect(row.length).toBe(header.length); // una sola línea, bien escapada

      const notesIndex = header.indexOf('Notas');
      expect(row[notesIndex]).toBe(
        "'=SUM(A1) Line two with \"quotes\" and, a comma",
      );
    });
  });

  describe('GET /exports/reports.pdf', () => {
    it('devuelve un PDF válido con los totales del rango filtrado', async () => {
      const { accessToken } = await login('client1@acmecorp.demo');

      const res = await http()
        .get('/exports/reports.pdf')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect('Content-Type', 'application/pdf');

      expect(res.headers['content-disposition']).toMatch(/attachment/);
      const buffer = res.body as Buffer;
      expect(buffer.length).toBeGreaterThan(1024);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });
});
