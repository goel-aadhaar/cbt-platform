import { Module } from '@nestjs/common';

import { AdminAttemptsController } from './admin-attempts.controller';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ResultsModule } from '../results/results.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

@Module({
  // ResultsModule: a Practice Test (ASSESSMENT) attempt is evaluated the
  // moment it is submitted rather than waiting for an admin/teacher publish
  // step or the exam's own window to close — see AttemptsService.submit().
  imports: [AuthModule, MediaModule, ResultsModule], // for TenantContextService
  controllers: [AttemptsController, AdminAttemptsController],
  providers: [AttemptsService],
  /**
   * Exported so sibling modules (e.g. ExamsModule, for live-exit admin
   * controls that need to bump per-attempt deadlines) can import this
   * service through the module boundary. The underlying types stay
   * unchanged; this is the only line on which this module declares its
   * public surface.
   */
  exports: [AttemptsService],
})
export class AttemptsModule {}
