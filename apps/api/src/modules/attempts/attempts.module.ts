import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

@Module({
  imports: [AuthModule, MediaModule], // for TenantContextService
  controllers: [AttemptsController],
  providers: [AttemptsService],
})
export class AttemptsModule {}
