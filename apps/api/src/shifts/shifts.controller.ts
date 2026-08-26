import { Controller, Get, Post, Query } from '@nestjs/common';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { ShiftsService } from './shifts.service';

function clampDays(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.min(Math.max(Math.trunc(n), 1), 30);
}

// Fase 4 (plan.md): la RLS de call_reports exige un turno abierto para
// que un agente pueda insertar un reporte -- este módulo no estaba en el
// alcance original de la fase, se agregó cuando se descubrió esa
// dependencia (ver PROGRESS.md).
@Controller('agent/shifts')
@Roles(Role.agent)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('current')
  current(@CurrentUser() user: RequestUser) {
    return this.shiftsService.current(user);
  }

  @Get()
  history(@CurrentUser() user: RequestUser, @Query('days') days?: string) {
    return this.shiftsService.history(user, clampDays(days));
  }

  @AuditEntity('Shift')
  @Post('clock-in')
  clockIn(@CurrentUser() user: RequestUser) {
    return this.shiftsService.clockIn(user);
  }

  @AuditEntity('Shift')
  @Post('clock-out')
  clockOut(@CurrentUser() user: RequestUser) {
    return this.shiftsService.clockOut(user);
  }
}
