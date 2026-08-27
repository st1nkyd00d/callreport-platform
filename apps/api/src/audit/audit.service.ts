import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { RequestUser } from '../common/request-user';

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
  after?: string;
  limit: number;
}

// Visor de auditoría (plan.md Fase 7). RLS (audit_logs_staff_select,
// migración 20260827030333_audit_logs_rls) es el corte real de quién
// puede leer -- @Roles(supervisor, super_admin) en el controller es
// defensa en profundidad, no la única barrera.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: RequestUser, filters: AuditLogFilters) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.action) where.action = filters.action;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    const db = this.prisma.forUser(user);
    const rows = await db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.after ? { cursor: { id: filters.after }, skip: 1 } : {}),
      include: { user: { select: { fullName: true, email: true } } },
    });

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // Valores distintos de action/entityType REALMENTE presentes en la
  // tabla -- el tipo AuditAction de packages/shared incluye acciones que
  // el backend nunca escribe (suspend/clock_in/clock_out son del mock de
  // Fase 3), así que un select armado a mano con ese tipo mostraría
  // opciones vacías. distinct + forUser() ya acotado por RLS.
  async filterOptions(user: RequestUser) {
    const db = this.prisma.forUser(user);
    const [actions, entityTypes] = await Promise.all([
      db.auditLog.findMany({ select: { action: true }, distinct: ['action'] }),
      db.auditLog.findMany({ select: { entityType: true }, distinct: ['entityType'] }),
    ]);
    return {
      actions: actions.map((a) => a.action).sort(),
      entityTypes: entityTypes.map((e) => e.entityType).sort(),
    };
  }
}
