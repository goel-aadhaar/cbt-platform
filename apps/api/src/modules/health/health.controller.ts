import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from './database.health';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /** Liveness — is the process up and serving HTTP? (no dependency checks) */
  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  /** Readiness — are dependencies (DB) healthy? Used by the load balancer. */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
