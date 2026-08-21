import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { AuditModule } from '../audit/audit.module';
import { AuditHealthIndicator } from './audit.health';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, AuditModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, AuditHealthIndicator],
})
export class HealthModule {}
