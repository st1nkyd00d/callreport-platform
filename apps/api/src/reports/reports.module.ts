import { Module } from '@nestjs/common';
import { AgentReportsController } from './agent-reports.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController, AgentReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
