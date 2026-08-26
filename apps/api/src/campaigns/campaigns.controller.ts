import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateDispositionDto } from './dto/create-disposition.dto';
import { SetCampaignAgentsDto } from './dto/set-campaign-agents.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateDispositionDto } from './dto/update-disposition.dto';

// Fase 3 (plan.md): a diferencia de tenants/usuarios, un supervisor SÍ
// puede crear y editar campañas -- por eso no hay ningún @Roles de método
// más restrictivo acá abajo, solo el de clase.
@Controller('admin/campaigns')
@Roles(Role.super_admin, Role.supervisor)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.campaignsService.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.campaignsService.findOne(user, id);
  }

  @AuditEntity('Campaign')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(user, dto);
  }

  @AuditEntity('Campaign')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(user, id, dto);
  }

  @AuditEntity('Campaign')
  @Put(':id/agents')
  setAgents(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetCampaignAgentsDto,
  ) {
    return this.campaignsService.setAgents(user, id, dto);
  }

  @Get(':id/dispositions')
  listDispositions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.campaignsService.listDispositions(user, id);
  }

  @AuditEntity('Disposition')
  @Post(':id/dispositions')
  createDisposition(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateDispositionDto,
  ) {
    return this.campaignsService.createDisposition(user, id, dto);
  }

  @AuditEntity('Disposition')
  @Patch(':id/dispositions/:dispositionId')
  updateDisposition(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('dispositionId') dispositionId: string,
    @Body() dto: UpdateDispositionDto,
  ) {
    return this.campaignsService.updateDisposition(
      user,
      id,
      dispositionId,
      dto,
    );
  }
}
