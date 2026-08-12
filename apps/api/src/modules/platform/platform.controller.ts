import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformService } from './platform.service';

/** Platform-wide view for the superadmin. Cross-tenant by design. */
@ApiTags('platform')
@ApiBearerAuth()
@Roles(Role.SUPERADMIN)
@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

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
}
