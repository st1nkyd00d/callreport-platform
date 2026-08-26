import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/request-user';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async current(user: RequestUser) {
    const db = this.prisma.forUser(user);
    const shift = await db.shift.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (!shift) return null;

    const reportsCount = await db.callReport.count({
      where: { shiftId: shift.id },
    });
    return { ...shift, reportsCount };
  }

  history(user: RequestUser, days: number) {
    return this.prisma.forUser(user).shift.findMany({
      where: { userId: user.id, startedAt: { gte: daysAgo(days) } },
      orderBy: { startedAt: 'desc' },
    });
  }

  // El índice único parcial shifts_one_open_per_user (Fase 3) es la red
  // de seguridad real ante una condición de carrera; este findFirst
  // previo solo existe para devolver un 409 con mensaje en vez de un
  // error crudo de constraint violation.
  async clockIn(user: RequestUser) {
    const db = this.prisma.forUser(user);
    const open = await db.shift.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (open) throw new ConflictException('Ya tenés un turno abierto');

    return db.shift.create({ data: { userId: user.id } });
  }

  async clockOut(user: RequestUser) {
    const db = this.prisma.forUser(user);
    const open = await db.shift.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (!open) throw new ConflictException('No tenés un turno abierto');

    return db.shift.update({
      where: { id: open.id },
      data: { endedAt: new Date() },
    });
  }
}
