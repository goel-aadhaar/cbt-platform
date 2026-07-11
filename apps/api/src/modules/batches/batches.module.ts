import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [BatchesController],
  providers: [BatchesService],
})
export class BatchesModule {}
