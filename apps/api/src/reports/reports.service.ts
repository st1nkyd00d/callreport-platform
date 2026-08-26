import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import type { CreateReportDto } from './dto/create-report.dto';
import type { UpdateReportDto } from './dto/update-report.dto';

interface Pagination {
  take: number;
  skip: number;
}

type ReportRange = 'today' | 'week';

const REPORT_INCLUDE = {
  disposition: true,
  campaign: { select: { id: true, name: true } },
} as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Endpoint de humo de la Fase 2 (plan.md, tarea 4): existe solo para
// probar el aislamiento RLS end-to-end vía forUser(). La paginación por
// cursor y los filtros reales (from/to/disposition/campaign) llegan en
// la Fase 5 junto con el resto de GET /reports.
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: RequestUser, pagination: Pagination) {
    const db = this.prisma.forUser(user);
    return db.callReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: pagination.take,
      skip: pagination.skip,
    });
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

    return db.callReport.create({
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

    return db.callReport.update({
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
  }
}
