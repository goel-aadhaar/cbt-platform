import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ImportsModule } from '../imports/imports.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [AuthModule, ImportsModule], // TenantContextService + import history
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
