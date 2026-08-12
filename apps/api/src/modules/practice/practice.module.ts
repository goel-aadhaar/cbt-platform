import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [AuthModule, MediaModule], // for TenantContextService
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
