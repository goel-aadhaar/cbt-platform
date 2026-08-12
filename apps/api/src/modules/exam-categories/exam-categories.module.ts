import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ExamCategoriesController } from './exam-categories.controller';
import { ExamCategoriesService } from './exam-categories.service';

@Module({
  imports: [AuthModule], // TenantContextService
  controllers: [ExamCategoriesController],
  providers: [ExamCategoriesService],
  exports: [ExamCategoriesService], // exams claim a sequence on approval
})
export class ExamCategoriesModule {}
