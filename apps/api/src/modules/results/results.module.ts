import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminResultsController } from './admin-results.controller';
import { ResultsService } from './results.service';
import { StudentResultController } from './student-result.controller';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [AdminResultsController, StudentResultController],
  providers: [ResultsService],
})
export class ResultsModule {}
