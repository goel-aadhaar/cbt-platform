import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from './prisma.service';
import { tenantRlsExtension } from './tenant-rls.extension';
import { TenantContextService } from '../modules/auth/tenant/tenant-context.service';

/**
 * Global database module — PrismaService becomes injectable anywhere without
 * re-importing this module (like a single shared DataSource bean).
 *
 * PrismaService is provided via a factory rather than as a plain class,
 * because the injected instance needs the tenant RLS extension
 * (`tenant-rls.extension.ts`, DEF-001) applied. `$extends()` returns a new
 * object rather than mutating `this`, and that object is not
 * `instanceof PrismaService` — so its `onModuleInit`/`onModuleDestroy` are
 * reattached from the pre-extension instance for Nest's lifecycle hooks to
 * find, and `.raw` is set to that same pre-extension instance (see its
 * doc-comment in prisma.service.ts).
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: (
        configService: ConfigService,
        tenantContext: TenantContextService,
      ): PrismaService => {
        const base = new PrismaService(configService);
        const extended = base.$extends(
          tenantRlsExtension(tenantContext),
        ) as unknown as PrismaService;
        extended.raw = base;
        extended.onModuleInit = () => base.onModuleInit();
        extended.onModuleDestroy = () => base.onModuleDestroy();
        return extended;
      },
      inject: [ConfigService, TenantContextService],
    },
  ],
  exports: [PrismaService],
})
export class DatabaseModule {}
