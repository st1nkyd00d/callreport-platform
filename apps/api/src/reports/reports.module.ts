import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentReportsController } from './agent-reports.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [ReportsController, AgentReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
