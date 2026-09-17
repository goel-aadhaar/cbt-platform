import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { DppController, MyDppController } from './dpp.controller';
import { DppService } from './dpp.service';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [AuthModule, MediaModule], // for TenantContextService / TeacherScopeService
  controllers: [PracticeController, DppController, MyDppController],
  providers: [PracticeService, DppService],
})
export class PracticeModule {}
