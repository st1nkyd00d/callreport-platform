import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Role } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { RequestUser } from '../common/request-user';
import type { CreateReportDto } from './dto/create-report.dto';
import type { UpdateReportDto } from './dto/update-report.dto';

type ReportRange = 'today' | 'week';

export interface ReportFilters {
  from?: Date;
  to?: Date;
  campaignId?: string;
  dispositionIds?: string[];
  scheduledFrom?: Date;
  after?: string;
  limit: number;
}

const REPORT_INCLUDE = {
  disposition: true,
  campaign: { select: { id: true, name: true } },
  agent: { select: { id: true, fullName: true } },
} as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Fase 4 (endpoint de humo, plan.md Fase 2) + Fase 5 (filtros/cursor
// reales, GET /reports/summary, GET /reports/:id y los emits de socket).
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  // Filtros del dashboard del cliente (plan.md Fase 5): from/to/campaign/
  // disposition + cursor por id (createdAt no es único, Prisma exige un
  // campo único para `cursor`). RLS ya limita las filas al tenant/rol de
  // `user` -- este where solo agrega los filtros que pidió el cliente.
  async findAll(user: RequestUser, filters: ReportFilters) {
    const where: Prisma.CallReportWhereInput = {};
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.dispositionIds?.length) {
      where.dispositionId = { in: filters.dispositionIds };
    }
    if (filters.scheduledFrom) {
      where.scheduledAt = { gte: filters.scheduledFrom };
    }

    // "Próximas citas" (scheduledFrom, sin cursor -- el carrusel del
    // dashboard pide una sola página de 10) ordena por la cita más
    // próxima primero, no por creación: el feed normal sí quiere
    // createdAt desc, pero para citas eso mostraría la última cargada,
    // no la más urgente.
    const orderBy: Prisma.CallReportOrderByWithRelationInput[] = filters.scheduledFrom
      ? [{ scheduledAt: 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }];

    const db = this.prisma.forUser(user);
    const rows = await db.callReport.findMany({
      where,
      orderBy,
      take: filters.limit + 1,
      ...(filters.after ? { cursor: { id: filters.after }, skip: 1 } : {}),
      include: REPORT_INCLUDE,
    });

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // Tarjetas KPI del dashboard (plan.md Fase 5). groupBy sí pasa por el
  // interceptor de forUser() (tiene `model`), a diferencia de $queryRaw
  // (ver prisma.service.ts: la rama `if (!model)` no fija los GUC de RLS
  // -- una raw query acá devolvería cero filas sin contexto de tenant).
  async summary(
    user: RequestUser,
    filters: Omit<ReportFilters, 'after' | 'limit'>,
  ) {
    const where: Prisma.CallReportWhereInput = {};
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.dispositionIds?.length) {
      where.dispositionId = { in: filters.dispositionIds };
    }

    const db = this.prisma.forUser(user);
    const grouped = await db.callReport.groupBy({
      by: ['dispositionId'],
      where,
      _count: { _all: true },
    });

    const dispositionIds = grouped.map((g) => g.dispositionId);
    const dispositions = dispositionIds.length
      ? await db.disposition.findMany({ where: { id: { in: dispositionIds } } })
      : [];
    const byId = new Map(dispositions.map((d) => [d.id, d]));

    const byDisposition = grouped.map((g) => {
      const d = byId.get(g.dispositionId);
      return {
        dispositionId: g.dispositionId,
        code: d?.code ?? null,
        label: d?.label ?? 'Desconocida',
        color: d?.color ?? null,
        count: g._count._all,
      };
    });

    return {
      total: byDisposition.reduce((sum, d) => sum + d.count, 0),
      byDisposition,
    };
  }

  async findOne(user: RequestUser, id: string) {
    const report = await this.prisma.forUser(user).callReport.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    return report;
  }

  // Fase 4: reportes propios del agente, para "Mis reportes de hoy/esta
  // semana" en el móvil.
  findAllForAgent(user: RequestUser, range: ReportRange) {
    const from = range === 'week' ? daysAgo(7) : startOfToday();
    return this.prisma.forUser(user).callReport.findMany({
      where: { agentId: user.id, createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      include: REPORT_INCLUDE,
    });
  }

  // tenant_id/agent_id/shift_id se derivan acá, nunca del cliente
  // (plan.md Fase 4): el DTO ni siquiera declara esos campos, así que el
  // ValidationPipe global los rechazaría con 400 si vinieran en el body.
  async create(user: RequestUser, dto: CreateReportDto) {
    const db = this.prisma.forUser(user);

    // campaign_agents NO tiene RLS (a diferencia de campaigns/dispositions/
    // call_reports -- ver enable_rls/shifts_rls, esa tabla nunca aparece
    // ahí) así que esta consulta es la única forma de distinguir "no
    // asignado" (403) de "no existe" (404): si se consultara primero
    // campaigns vía forUser(), RLS ya filtraría por esta misma asignación
    // y ambos casos volverían indistinguibles.
    const assignment = await db.campaignAgent.findFirst({
      where: { campaignId: dto.campaignId, userId: user.id, isActive: true },
    });
    if (!assignment) {
      throw new ForbiddenException('No estás asignado a esta campaña');
    }

    const campaign = await db.campaign.findUnique({
      where: { id: dto.campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    const shift = await db.shift.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (!shift) {
      throw new ConflictException('Iniciá tu turno para registrar llamadas');
    }

    const disposition = await db.disposition.findFirst({
      where: {
        id: dto.dispositionId,
        campaignId: dto.campaignId,
        isActive: true,
      },
    });
    if (!disposition) {
      throw new BadRequestException(
        'La tipificación no pertenece a esta campaña',
      );
    }
    if (disposition.requiresSchedule) {
      if (!dto.scheduledAt) {
        throw new BadRequestException(
          'Esta tipificación requiere fecha y hora de la cita',
        );
      }
      if (new Date(dto.scheduledAt).getTime() <= Date.now()) {
        throw new BadRequestException(
          'La fecha y hora de la cita debe ser futura',
        );
      }
    }
    if (disposition.requiresDetail && !dto.detailText?.trim()) {
      throw new BadRequestException(
        'Esta tipificación requiere especificar un detalle',
      );
    }

    const report = await db.callReport.create({
      data: {
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        agentId: user.id,
        shiftId: shift.id,
        dispositionId: disposition.id,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        notes: dto.notes,
        scheduledAt:
          disposition.requiresSchedule && dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null,
        detailText: disposition.requiresDetail ? dto.detailText : null,
      },
      include: REPORT_INCLUDE,
    });
    // Emite DESPUÉS de que el INSERT confirmó (plan.md Fase 5): el socket
    // es mejora de experiencia, nunca la fuente de verdad del create.
    this.realtime.emitReportCreated(report);
    // Fire-and-forget (plan.md Fase 6): una caída de la API de Expo nunca
    // puede tumbar el 201 de un reporte ya confirmado en la base.
    this.notifications.notifyReportCreated(report).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error notificando push para reporte ${report.id}: ${message}`);
    });
    return report;
  }

  async update(user: RequestUser, id: string, dto: UpdateReportDto) {
    const db = this.prisma.forUser(user);
    const report = await db.callReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');

    // Un agente puede VER (RLS call_reports_agent_select) los reportes de
    // toda su campaña, no solo los propios -- la edición sí es estricta:
    // solo el autor, y solo dentro de la ventana del tenant. Staff
    // (call_reports_staff_all) siempre puede.
    if (user.role === Role.agent) {
      if (report.agentId !== user.id) {
        throw new ForbiddenException('Solo podés editar tus propios reportes');
      }
      const tenant = await db.tenant.findUnique({
        where: { id: report.tenantId },
      });
      const windowMinutes = tenant?.editWindowMinutes ?? 30;
      const elapsedMs = Date.now() - report.createdAt.getTime();
      if (elapsedMs > windowMinutes * 60_000) {
        throw new ForbiddenException(
          `La ventana de edición de ${windowMinutes} minutos ya venció; pedile el cambio a un supervisor`,
        );
      }
    }

    let dispositionId = report.dispositionId;
    let requiresSchedule = false;
    let requiresDetail = false;
    if (dto.dispositionId) {
      const disposition = await db.disposition.findFirst({
        where: {
          id: dto.dispositionId,
          campaignId: report.campaignId,
          isActive: true,
        },
      });
      if (!disposition) {
        throw new BadRequestException(
          'La tipificación no pertenece a esta campaña',
        );
      }
      dispositionId = disposition.id;
      requiresSchedule = disposition.requiresSchedule;
      requiresDetail = disposition.requiresDetail;
    }

    const updated = await db.callReport.update({
      where: { id },
      data: {
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        notes: dto.notes,
        dispositionId,
        scheduledAt:
          requiresSchedule && dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : undefined,
        detailText: requiresDetail ? dto.detailText : undefined,
      },
      include: REPORT_INCLUDE,
    });
    this.realtime.emitReportUpdated(updated);
    return updated;
  }
}
