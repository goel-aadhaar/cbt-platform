import { Global, Module } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';

/**
 * Standalone module for TenantContextService, split out from AuthModule so
 * DatabaseModule can inject it (for the tenant RLS Prisma extension) without
 * creating a circular module dependency — AuthModule itself depends on
 * DatabaseModule for PrismaService. TenantContextService has no constructor
 * dependencies of its own, so this module has none either.
 *
 * Global so every existing `constructor(private readonly tenant:
 * TenantContextService)` across the app keeps resolving to this one
 * singleton without each module needing to import this one explicitly.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantContextModule {}
