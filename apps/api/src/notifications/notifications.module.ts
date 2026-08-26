import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushTokensController } from './push-tokens.controller';
import { PushTokensService } from './push-tokens.service';

// NotificationsService es lo único que exporta -- ReportsModule y
// FollowupsModule lo consumen para disparar push tras crear un reporte o
// resolver un seguimiento (Fase 6, plan.md).
@Module({
  controllers: [PushTokensController],
  providers: [PushService, PushTokensService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
