import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentReportsController } from './agent-reports.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [RealtimeModule],
  controllers: [ReportsController, AgentReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
