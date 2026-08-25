import { Module } from '@nestjs/common';

import { AttemptsModule } from '../attempts/attempts.module';
import { AuthModule } from '../auth/auth.module';
import { ExamCategoriesModule } from '../exam-categories/exam-categories.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  // AttemptsModule feeds ExamsService so the live-edit / pause / force-end
  // path can reach per-row attempt deadlines. Forward dependency only —
  // attempts does not import exams.
  imports: [AuthModule, ExamCategoriesModule, AttemptsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
