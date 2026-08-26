import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/request-user';

interface Pagination {
  take: number;
  skip: number;
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
}
