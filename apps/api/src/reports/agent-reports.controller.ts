import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { ReportsService } from './reports.service';

function parseRange(value: string | undefined): 'today' | 'week' {
  return value === 'week' ? 'week' : 'today';
}

// Fase 4 (plan.md): "GET /agent/reports?date=today -- reportes propios
// recientes". Se agrega también range=week para la pestaña "Mis
// reportes" del móvil (toggle Hoy / Esta semana).
@Controller('agent/reports')
@Roles(Role.agent)
export class AgentReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser, @Query('range') range?: string) {
    return this.reportsService.findAllForAgent(user, parseRange(range));
  }
}
