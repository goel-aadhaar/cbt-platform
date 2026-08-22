import { Module } from '@nestjs/common';

import { InstitutesController } from './institutes.controller';
import { InstituteUsageService } from './institute-usage.service';
import { InstitutesService } from './institutes.service';

@Module({
  controllers: [InstitutesController],
  providers: [InstitutesService, InstituteUsageService],
})
export class InstitutesModule {}
