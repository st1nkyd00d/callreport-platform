import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
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

  @Roles(Role.agent)
  @AuditEntity('CallReport')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user, dto);
  }

  @Roles(Role.agent, Role.supervisor, Role.super_admin)
  @AuditEntity('CallReport')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reportsService.update(user, id, dto);
  }
}
