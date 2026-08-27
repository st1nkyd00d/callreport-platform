import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuditAction, AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { FollowupsService } from './followups.service';

function clampLimit(
  value: string | undefined,
  def: number,
  max: number,
): number {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return def;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

// client_user (RLS los limita a su tenant vía call_reports_client_select)
// y staff (ven todo). El agente no participa de la cola de seguimientos
// (plan.md Fase 6: la resuelve "client_user del tenant o supervisor").
@Controller('followups')
@Roles(Role.client_user, Role.supervisor, Role.super_admin)
export class FollowupsController {
  constructor(private readonly followupsService: FollowupsService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    if (status !== 'pending' && status !== 'resolved') {
      throw new BadRequestException("status debe ser 'pending' o 'resolved'");
    }
    return this.followupsService.findAll(user, {
      status,
      after,
      limit: clampLimit(limit, 25, 100),
    });
  }

  @Get('count')
  count(@CurrentUser() user: RequestUser) {
    return this.followupsService.count(user);
  }

  @AuditEntity('CallReport')
  @AuditAction('resolve_followup')
  @Post(':reportId/resolve')
  resolve(
    @CurrentUser() user: RequestUser,
    @Param('reportId') reportId: string,
  ) {
    return this.followupsService.resolve(user, reportId);
  }
}
