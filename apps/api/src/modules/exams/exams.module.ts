import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ExamCategoriesModule } from '../exam-categories/exam-categories.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [AuthModule, ExamCategoriesModule], // for TenantContextService
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
