import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { RequestUser } from '../common/request-user';
import { CampaignsService } from './campaigns.service';

// Fase 5 (plan.md): espejo de AgentCampaignsController para el dashboard
// del cliente. RLS (campaigns_client_select / dispositions_client_select)
// ya limita ambos endpoints al tenant del JWT.
@Controller('client')
@Roles(Role.client_user)
export class ClientCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get('campaigns')
  findCampaigns(@CurrentUser() user: RequestUser) {
    return this.campaignsService.findAllForClient(user);
  }

  @Get('dispositions')
  findDispositions(@CurrentUser() user: RequestUser) {
    return this.campaignsService.listTenantDispositions(user);
  }
}
