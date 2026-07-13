import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller({ path: 'me', version: '1' })
export class MyHistoryController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** The calling student's own published exam history. */
  @Get('history')
  history() {
    return this.analytics.getMyHistory();
  }
}
