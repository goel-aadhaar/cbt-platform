import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { PrismaService } from '../../database/prisma.service';

/**
 * Readiness probe for PostgreSQL. Runs a trivial `SELECT 1` through Prisma and
 * reports the 'database' indicator up/down. Uses terminus v11's
 * HealthIndicatorService API (works cleanly with the Prisma 7 client).
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message:
          error instanceof Error ? error.message : 'database unreachable',
      });
    }
  }
}
