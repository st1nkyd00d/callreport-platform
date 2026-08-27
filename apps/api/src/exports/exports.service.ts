import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { Prisma } from '../../generated/prisma/client';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CSV_BOM, CSV_LINE_BREAK, toCsvRow } from './csv.util';
import type { ExportFilters } from './export-filters';
import { buildReportsPdfDocument } from './reports-pdf.template';

// Lotes cortos vía forUserRaw() en vez de un DECLARE CURSOR de Postgres
// (plan-fase-7.md D1): el runtime se conecta al endpoint *pooled* de
// Neon (PgBouncer, modo transacción) y las transacciones interactivas de
// Prisma tienen timeout -- un cursor abierto durante toda la descarga
// pinnearía la conexión y podría morir a mitad de stream. Cada lote abre
// y cierra su propia transacción corta.
const BATCH_SIZE = 500;

interface ExportRow {
  id: string;
  createdAt: Date;
  tenantName: string;
  campaignName: string;
  dispositionLabel: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  agentName: string;
  scheduledAt: Date | null;
  detailText: string | null;
  notes: string | null;
  followupResolvedAt: Date | null;
}

function buildFilename(prefix: string, filters: ExportFilters, ext: string): string {
  const from = filters.from ? isoDate(filters.from) : 'inicio';
  const to = filters.to ? isoDate(filters.to) : 'hoy';
  const safePrefix = prefix.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  return `callreport_${safePrefix}_${from}_a_${to}.${ext}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function contentDispositionHeader(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly config: ConfigService,
  ) {}

  private get tz(): string {
    return this.config.get<string>('METRICS_TZ') ?? 'UTC';
  }

  private formatDate(date: Date | null): string {
    if (!date) return '';
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: this.tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private isStaff(user: RequestUser): boolean {
    return user.role === Role.supervisor || user.role === Role.super_admin;
  }

  // Streaming keyset por lotes (D1) con backpressure explícito (D2): si
  // res.write() devuelve false, el buffer interno de Node ya está lleno
  // -- hay que esperar 'drain' antes de pedir el próximo lote, si no la
  // memoria crece con cada lote que la base entrega más rápido de lo que
  // el cliente consume (justo el escenario que rompe el criterio de
  // aceptación "memoria constante").
  async streamReportsCsv(
    user: RequestUser,
    filters: ExportFilters,
    res: Response,
  ): Promise<void> {
    const staff = this.isStaff(user);
    const filename = buildFilename('reportes', filters, 'csv');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', contentDispositionHeader(filename));

    let aborted = false;
    res.on('close', () => {
      if (!res.writableEnded) aborted = true;
    });

    const write = (chunk: string): Promise<void> => {
      if (res.write(chunk)) return Promise.resolve();
      return new Promise((resolve) => res.once('drain', resolve));
    };

    const header = [
      'ID',
      'Fecha',
      ...(staff ? ['Empresa'] : []),
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
    ];

    try {
      await write(CSV_BOM + toCsvRow(header) + CSV_LINE_BREAK);

      let cursor: { createdAt: Date; id: string } | undefined;
      for (;;) {
        if (aborted) break;
        const rows = await this.fetchBatch(user, filters, cursor);
        if (rows.length === 0) break;

        let chunk = '';
        for (const row of rows) {
          chunk += toCsvRow(this.toCsvCells(row, staff)) + CSV_LINE_BREAK;
        }
        await write(chunk);

        if (rows.length < BATCH_SIZE) break;
        const last = rows[rows.length - 1];
        cursor = { createdAt: last.createdAt, id: last.id };
      }
      if (!aborted) res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Export CSV falló a mitad de stream (userId=${user.id}): ${message}`);
      // Los headers ya salieron -- no se puede convertir esto en un 4xx/5xx
      // JSON limpio a esta altura. Cortar la conexión es preferible a
      // dejar un archivo CSV truncado que parezca completo con status 200.
      res.destroy(err instanceof Error ? err : new Error(message));
    }
  }

  private toCsvCells(row: ExportRow, staff: boolean): unknown[] {
    return [
      row.id,
      this.formatDate(row.createdAt),
      ...(staff ? [row.tenantName] : []),
      row.campaignName,
      row.dispositionLabel,
      row.contactName,
      row.contactPhone,
      row.contactEmail ?? '',
      row.agentName,
      this.formatDate(row.scheduledAt),
      row.detailText ?? '',
      row.notes ?? '',
      row.followupResolvedAt ? this.formatDate(row.followupResolvedAt) : '',
    ];
  }

  private fetchBatch(
    user: RequestUser,
    filters: ExportFilters,
    cursor: { createdAt: Date; id: string } | undefined,
  ): Promise<ExportRow[]> {
    return this.prisma.forUserRaw(user, (tx) => {
      const conditions: Prisma.Sql[] = [];
      if (filters.from) conditions.push(Prisma.sql`cr.created_at >= ${filters.from}`);
      if (filters.to) conditions.push(Prisma.sql`cr.created_at <= ${filters.to}`);
      if (filters.campaignId) conditions.push(Prisma.sql`cr.campaign_id = ${filters.campaignId}`);
      if (filters.dispositionIds?.length) {
        conditions.push(Prisma.sql`cr.disposition_id = ANY(${filters.dispositionIds})`);
      }
      if (filters.tenantId) conditions.push(Prisma.sql`cr.tenant_id = ${filters.tenantId}`);
      if (cursor) {
        conditions.push(Prisma.sql`(cr.created_at, cr.id) < (${cursor.createdAt}, ${cursor.id})`);
      }
      const where = conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;

      return tx.$queryRaw<ExportRow[]>`
        SELECT cr.id, cr.created_at AS "createdAt", t.name AS "tenantName",
               c.name AS "campaignName", d.label AS "dispositionLabel",
               cr.contact_name AS "contactName", cr.contact_phone AS "contactPhone",
               cr.contact_email AS "contactEmail", u.full_name AS "agentName",
               cr.scheduled_at AS "scheduledAt", cr.detail_text AS "detailText",
               cr.notes, cr.followup_resolved_at AS "followupResolvedAt"
        FROM call_reports cr
        JOIN tenants t ON t.id = cr.tenant_id
        JOIN campaigns c ON c.id = cr.campaign_id
        JOIN dispositions d ON d.id = cr.disposition_id
        JOIN users u ON u.id = cr.agent_id
        WHERE ${where}
        ORDER BY cr.created_at DESC, cr.id DESC
        LIMIT ${BATCH_SIZE}
      `;
    });
  }

  // PDF: resumen ejecutivo, NO el dataset (plan.md Fase 7). Reusa
  // ReportsService.summary()/findAll() en vez de SQL nuevo (D5) --
  // limitado a 200 filas a propósito, con la nota "descargue el CSV para
  // el detalle completo" que pide plan.md; por eso NO necesita streaming.
  // tenants no tiene RLS (nunca estuvo en enable_rls -- es referencia
  // global, mismo criterio que ya usa ReportsService.update() para leer
  // tenant.editWindowMinutes con un forUser(agente)), así que cualquier
  // contexto autenticado puede resolver el nombre por id sin filas extra.
  private async resolveTenantLabel(
    user: RequestUser,
    filters: ExportFilters,
    staff: boolean,
  ): Promise<string> {
    const tenantId = staff ? filters.tenantId : user.tenantId;
    if (!tenantId) return staff ? 'Todas las empresas' : '';
    const tenant = await this.prisma
      .forUser(user)
      .tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name ?? '';
  }

  async buildReportsPdf(
    user: RequestUser,
    filters: ExportFilters,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const staff = this.isStaff(user);
    const [summary, page, tenantLabel] = await Promise.all([
      this.reports.summary(user, filters),
      this.reports.findAll(user, { ...filters, limit: 200 }),
      this.resolveTenantLabel(user, filters, staff),
    ]);

    const rangeLabel = `${filters.from ? this.formatDate(filters.from) : 'inicio'} — ${filters.to ? this.formatDate(filters.to) : 'hoy'}`;
    const buffer = await buildReportsPdfDocument({
      tenantLabel,
      rangeLabel,
      generatedAt: this.formatDate(new Date()),
      total: summary.total,
      byDisposition: summary.byDisposition,
      rows: page.items.map((r) => ({
        createdAt: this.formatDate(r.createdAt),
        campaign: r.campaign.name,
        disposition: r.disposition.label,
        contactName: r.contactName,
        agent: r.agent.fullName,
      })),
      truncated: page.nextCursor !== null,
    });

    return { buffer, filename: buildFilename(tenantLabel || 'reportes', filters, 'pdf') };
  }
}
