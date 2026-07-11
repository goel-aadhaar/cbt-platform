import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
