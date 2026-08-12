import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import {
  ExamAnalyticsController,
  StudentHistoryController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MyHistoryController } from './my-history.controller';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [
    ExamAnalyticsController,
    StudentHistoryController,
    MyHistoryController,
    DashboardController,
  ],
  providers: [AnalyticsService, DashboardService],
})
export class AnalyticsModule {}
