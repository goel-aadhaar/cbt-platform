import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
