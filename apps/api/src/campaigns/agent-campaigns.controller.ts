import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CampaignsService } from './campaigns.service';

// Fase 4 (plan.md): "GET /agent/campaigns -- solo las asignadas al
// agente (RLS ya lo garantiza; el endpoint solo ordena y formatea)".
// Deliberadamente separado de CampaignsController (admin/campaigns,
// @Roles(super_admin, supervisor)): distinto prefijo de ruta, distinto
// rol, y una forma de respuesta más chica.
@Controller('agent/campaigns')
@Roles(Role.agent)
export class AgentCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.campaignsService.findAllForAgent(user);
  }
}
