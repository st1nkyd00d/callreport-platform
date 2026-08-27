import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { AuditService } from './audit.service';

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

@Controller('admin/audit-logs')
@Roles(Role.supervisor, Role.super_admin)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll(user, {
      userId,
      entityType,
      action,
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
      after,
      limit: clampLimit(limit, 25, 100),
    });
  }

  @Get('filters')
  filterOptions(@CurrentUser() user: RequestUser) {
    return this.auditService.filterOptions(user);
  }
}
