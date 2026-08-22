import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformService } from './platform.service';
import { SystemHealthService } from './system-health.service';

/** Platform-wide view for the superadmin. Cross-tenant by design. */
@ApiTags('platform')
@ApiBearerAuth()
@Roles(Role.SUPERADMIN)
@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly health: SystemHealthService,
  ) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  /** Infrastructure/usage metrics for the dashboard charts. */
  @Get('usage')
  @ApiQuery({ name: 'days', required: false, type: Number })
  usage(@Query('days') days?: string) {
    const parsed = Number(days);
    const window =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 90) : 30;
    return this.platform.usageSnapshot(window);
  }

  /**
   * Machine and application vitals — CPU, memory, disk, request rate, latency
   * and error rate.
   *
   * Measured by this process about itself and the host it runs on, so it needs
   * no AWS agent and reports the same numbers one would. `GET /platform/usage`
   * remains the CloudWatch-backed view, for the things a single process cannot
   * see. Anything unmeasurable comes back null rather than zero.
   */
  @Get('system')
  system() {
    return this.health.snapshot();
  }
}
