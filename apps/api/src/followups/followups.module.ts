import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { FollowupsController } from './followups.controller';
import { FollowupsService } from './followups.service';

@Module({
  imports: [RealtimeModule],
  controllers: [FollowupsController],
  providers: [FollowupsService],
})
export class FollowupsModule {}
