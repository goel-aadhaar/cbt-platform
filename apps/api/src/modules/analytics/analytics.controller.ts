import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'exams', version: '1' })
export class ExamAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Aggregate analytics for an exam: score stats, distribution, item analysis. */
  @Get(':id/analytics')
  examAnalytics(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.getExamAnalytics(id);
  }
}

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'students', version: '1' })
export class StudentHistoryController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** A student's full exam history (admin view). */
  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.getStudentHistory(id);
  }
}
