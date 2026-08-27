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
  // Fase 7: ExportsModule reusa summary()/findAll() para el PDF (resumen
  // ejecutivo) en vez de duplicar SQL.
  exports: [ReportsService],
})
export class ReportsModule {}
