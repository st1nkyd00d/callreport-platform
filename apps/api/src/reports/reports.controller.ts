import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { ReportsService } from './reports.service';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Query params sin validar por diseño (no hay DTO de por medio): el
  // aislamiento no depende de nada que venga en la query -- ni siquiera
  // de un eventual `?tenantId=...` -- porque forUser() solo usa el
  // tenant que quedó en el JWT (ver criterio de aceptación de Fase 2).
  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.reportsService.findAll(user, {
      take: clamp(Number(take), 25, 100),
      skip: Math.max(Number(skip) || 0, 0),
    });
  }
}
