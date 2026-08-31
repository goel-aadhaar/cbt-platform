import { Module } from '@nestjs/common';

import { AttemptsModule } from '../attempts/attempts.module';
import { AuthModule } from '../auth/auth.module';
import { ExamCategoriesModule } from '../exam-categories/exam-categories.module';
import { ResultsModule } from '../results/results.module';
import { AssessmentClosureService } from './assessment-closure.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  // AttemptsModule feeds ExamsService so the live-edit / pause / force-end
  // path can reach per-row attempt deadlines. Forward dependency only —
  // attempts does not import exams. ResultsModule feeds
  // AssessmentClosureService's automatic evaluate() call on window-close —
  // ResultsModule does not import exams either, so no cycle there either.
  imports: [AuthModule, ExamCategoriesModule, AttemptsModule, ResultsModule],
  controllers: [ExamsController],
  providers: [ExamsService, AssessmentClosureService],
})
export class ExamsModule {}
