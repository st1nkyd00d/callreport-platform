import { Module } from '@nestjs/common';
import { AgentCampaignsController } from './agent-campaigns.controller';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { DispositionsController } from './dispositions.controller';

@Module({
  controllers: [
    CampaignsController,
    AgentCampaignsController,
    DispositionsController,
  ],
  providers: [CampaignsService],
})
export class CampaignsModule {}
