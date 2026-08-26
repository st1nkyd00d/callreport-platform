import {
  BadRequestException,
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

function clampLimit(
  value: string | undefined,
  def: number,
  max: number,
): number {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return def;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} no es una fecha válida`);
  }
  return d;
}

function parseIdList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

// Query params parseados a mano, sin DTO de clase (plan.md Fase 5): el
// ValidationPipe global (forbidNonWhitelisted, main.ts) convertiría un
// `?tenantId=...` forzado en un 400 y rompería el criterio de aceptación
// de Fase 2 (isolation.e2e-spec.ts espera 200 con filas ya filtradas por
// el tenant del JWT, ignorando cualquier query param ajeno al filtro).
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaignId') campaignId?: string,
    @Query('dispositionId') dispositionId?: string,
    @Query('scheduledFrom') scheduledFrom?: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.findAll(user, {
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
      campaignId,
      dispositionIds: parseIdList(dispositionId),
      scheduledFrom: parseDate(scheduledFrom, 'scheduledFrom'),
      after,
      limit: clampLimit(limit, 25, 100),
    });
  }

  @Get('summary')
  summary(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaignId') campaignId?: string,
    @Query('dispositionId') dispositionId?: string,
  ) {
    return this.reportsService.summary(user, {
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
      campaignId,
      dispositionIds: parseIdList(dispositionId),
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.reportsService.findOne(user, id);
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
