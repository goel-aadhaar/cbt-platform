import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service';
import { CloudWatchUsageAdapter } from './adapters/cloudwatch-usage.adapter';
import { DatabaseUsageAdapter } from './adapters/database-usage.adapter';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { MetricsMiddleware } from './metrics.middleware';
import { PlatformUsagePort } from './ports/platform-usage.port';
import { SystemHealthService } from './system-health.service';
import { SystemMetricsService } from './system-metrics.service';

/**
 * Superadmin platform module.
 *
 * CloudWatch is opt-in via AWS_CLOUDWATCH=true rather than inferred from
 * AWS_REGION, so configuring S3 for media does not silently change what the
 * dashboard claims to be measuring. Without it the database adapter reports
 * what the platform can measure about itself, which is what makes the console
 * usable before any AWS account exists (§4/§14).
 */
@Module({
  controllers: [PlatformController],
  providers: [
    PlatformService,
    SystemMetricsService,
    SystemHealthService,
    DatabaseUsageAdapter,
    {
      provide: PlatformUsagePort,
      inject: [ConfigService, PrismaService, DatabaseUsageAdapter],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        database: DatabaseUsageAdapter,
      ) =>
        config.get<string>('AWS_CLOUDWATCH') === 'true'
          ? new CloudWatchUsageAdapter(config, database)
          : database,
    },
  ],
  exports: [PlatformService, SystemMetricsService],
})
export class PlatformModule implements NestModule {
  /**
   * Applied to every route so the figures describe the whole API, not the
   * superadmin's own corner of it.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*splat');
  }
}
