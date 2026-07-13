import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import {
  ExamAnalyticsController,
  StudentHistoryController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { MyHistoryController } from './my-history.controller';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [
    ExamAnalyticsController,
    StudentHistoryController,
    MyHistoryController,
  ],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
