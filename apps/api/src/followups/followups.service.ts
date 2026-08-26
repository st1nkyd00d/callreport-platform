import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { Prisma } from '../../generated/prisma/client';
import type { RequestUser } from '../common/request-user';

type FollowupStatus = 'pending' | 'resolved';

// Mismo shape de include que ReportsService (REPORT_INCLUDE) -- se
// duplica acá en vez de importarlo para no acoplar FollowupsModule a
// ReportsModule por un detalle de serialización; ambos endpoints
// alimentan el mismo tipo ClientReport del lado del móvil.
const REPORT_INCLUDE = {
  disposition: true,
  campaign: { select: { id: true, name: true } },
  agent: { select: { id: true, fullName: true } },
} as const;

export interface FollowupFilters {
  status: FollowupStatus;
  after?: string;
  limit: number;
}

@Injectable()
export class FollowupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // Cola de seguimientos (plan.md Fase 6): reportes cuya tipificación
  // exige seguimiento (disposition.requiresFollowup), separados por si ya
  // se resolvieron. Mismo criterio de orden que el mock de referencia
  // (SeguimientosPage.tsx, apps/admin-web): pendientes por la cita más
  // próxima primero (nulls al final), resueltos por cuándo se resolvieron.
  async findAll(user: RequestUser, filters: FollowupFilters) {
    const where: Prisma.CallReportWhereInput = {
      disposition: { requiresFollowup: true },
      followupResolvedAt: filters.status === 'pending' ? null : { not: null },
    };

    const orderBy: Prisma.CallReportOrderByWithRelationInput[] =
      filters.status === 'pending'
        ? [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }]
        : [{ followupResolvedAt: 'desc' }, { id: 'desc' }];

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

  // Badge del tab "Seguimientos" en el móvil.
  async count(user: RequestUser): Promise<{ pending: number }> {
    const pending = await this.prisma.forUser(user).callReport.count({
      where: { disposition: { requiresFollowup: true }, followupResolvedAt: null },
    });
    return { pending };
  }

  // client_user del tenant o supervisor/super_admin (RLS: call_reports_
  // client_update / call_reports_staff_all). El agente no tiene ninguna
  // política de UPDATE para esta operación -- @Roles en el controller ya
  // lo bloquea antes de llegar acá, pero RLS es el límite real.
  async resolve(user: RequestUser, reportId: string) {
    const db = this.prisma.forUser(user);
    const report = await db.callReport.findUnique({
      where: { id: reportId },
      include: { disposition: true },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (!report.disposition.requiresFollowup) {
      throw new BadRequestException('Esta tipificación no requiere seguimiento');
    }
    if (report.followupResolvedAt) {
      throw new ConflictException('Este seguimiento ya fue resuelto');
    }

    const updated = await db.callReport.update({
      where: { id: reportId },
      data: {
        followupResolvedAt: new Date(),
        followupResolvedBy: user.id,
      },
      include: REPORT_INCLUDE,
    });
    this.realtime.emitFollowupResolved(updated);
    return updated;
  }
}
