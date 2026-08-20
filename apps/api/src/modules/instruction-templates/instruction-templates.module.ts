import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InstructionTemplatesController } from './instruction-templates.controller';
import { InstructionTemplatesService } from './instruction-templates.service';

@Module({
  imports: [AuthModule], // TenantContextService
  controllers: [InstructionTemplatesController],
  providers: [InstructionTemplatesService],
})
export class InstructionTemplatesModule {}
