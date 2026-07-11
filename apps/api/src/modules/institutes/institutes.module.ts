import { Module } from '@nestjs/common';

import { InstitutesController } from './institutes.controller';
import { InstitutesService } from './institutes.service';

@Module({
  controllers: [InstitutesController],
  providers: [InstitutesService],
})
export class InstitutesModule {}
