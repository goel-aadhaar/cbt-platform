import { Module } from '@nestjs/common';

import { AttemptsModule } from '../attempts/attempts.module';
import { AuthModule } from '../auth/auth.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AuthModule, AttemptsModule], // AttemptsModule for entry-requests
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
