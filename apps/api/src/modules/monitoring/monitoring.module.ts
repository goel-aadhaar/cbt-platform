import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
