import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

/**
 * Admin landing-page aggregates (§2.9).
 *
 * One endpoint rather than six so the first screen after login costs a single
 * round trip — it previously showed invented figures because nothing served
 * them.
 *
 * ADMIN only: every count here is institute-wide (§ batch-scoped teacher
 * access), and the teacher console builds its own dashboard client-side from
 * already-scoped endpoints instead of this one.
 */
@ApiTags('analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary() {
    return this.dashboard.summary();
  }
}
