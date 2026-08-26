import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { CampaignsService } from './campaigns.service';

// Fase 4 (plan.md): "GET /campaigns/:id/dispositions -- tipificaciones
// activas ordenadas". Sin @Roles: agente y client_user (Fase 5) leen
// acá, y RLS (dispositions_agent_select / dispositions_client_select)
// ya decide qué campañas puede ver cada uno -- este controller no
// necesita saber el rol de quien pregunta.
@Controller('campaigns')
export class DispositionsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get(':id/dispositions')
  listActive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.campaignsService.listActiveDispositions(user, id);
  }
}
