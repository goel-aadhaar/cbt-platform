import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Audit trail (§2.13). Registers a global interceptor that records every
 * state-changing request, plus an admin/superadmin query endpoint. AuditService
 * is exported so feature modules can also log explicit domain events.
 */
@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
