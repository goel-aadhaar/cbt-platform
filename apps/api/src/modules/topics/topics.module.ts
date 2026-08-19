import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
