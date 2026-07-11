import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
