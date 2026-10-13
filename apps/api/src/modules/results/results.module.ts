import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { AdminResultsController } from './admin-results.controller';
import { ResultsService } from './results.service';
import { StudentResultController } from './student-result.controller';

@Module({
  imports: [AuthModule, MediaModule], // TenantContextService; media URLs
  controllers: [AdminResultsController, StudentResultController],
  providers: [ResultsService],
  // QuestionsModule re-evaluates affected exams when an answer-key edit
  // invalidates results that have already been scored. Safe to export: nothing
  // in this module imports QuestionsModule, so there is no cycle.
  exports: [ResultsService],
})
export class ResultsModule {}
