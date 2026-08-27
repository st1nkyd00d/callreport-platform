import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { parseExportFilters } from './export-filters';
import { ExportsService } from './exports.service';

// Sin @Roles: mismo criterio que GET /reports (Fase 5) -- cualquier rol
// autenticado puede pedir su export, RLS decide qué filas ve (client_user
// las de su tenant, agent las de sus campañas asignadas, staff todas).
// La UI solo expone el botón a client_user (móvil) y a staff (admin-web,
// export global) -- plan.md no pide exportar para agent, pero no hace
// falta bloquearlo: no puede ver más de lo que ya ve en "Mis reportes".
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('reports.csv')
  async csv(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaignId') campaignId?: string,
    @Query('dispositionId') dispositionId?: string,
    @Query('tenantId') tenantId?: string,
  ): Promise<void> {
    const isStaff = user.role === Role.supervisor || user.role === Role.super_admin;
    const filters = parseExportFilters(
      { from, to, campaignId, dispositionId, tenantId },
      isStaff,
    );
    await this.exportsService.streamReportsCsv(user, filters, res);
  }

  @Get('reports.pdf')
  async pdf(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaignId') campaignId?: string,
    @Query('dispositionId') dispositionId?: string,
    @Query('tenantId') tenantId?: string,
  ): Promise<void> {
    const isStaff = user.role === Role.supervisor || user.role === Role.super_admin;
    const filters = parseExportFilters(
      { from, to, campaignId, dispositionId, tenantId },
      isStaff,
    );
    const { buffer, filename } = await this.exportsService.buildReportsPdf(user, filters);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }
}
