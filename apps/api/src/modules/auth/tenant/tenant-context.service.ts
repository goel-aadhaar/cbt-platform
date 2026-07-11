import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import { TenantContextData } from '../auth.types';

/**
 * Per-request tenant context via AsyncLocalStorage. Populated by
 * TenantContextInterceptor after auth; read by the Prisma tenant extension +
 * RLS session variable (added in the isolation increment) to scope every query.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContextData>();

  /** Run a callback within a tenant context (e.g. seeding, background jobs). */
  run<T>(context: TenantContextData, callback: () => T): T {
    return this.als.run(context, callback);
  }

  /** Bind the context to the current async execution (used per-request). */
  enterWith(context: TenantContextData): void {
    this.als.enterWith(context);
  }

  get(): TenantContextData | undefined {
    return this.als.getStore();
  }

  /** Current institute id, or null for superadmin / no context. */
  getInstituteId(): string | null {
    return this.als.getStore()?.instituteId ?? null;
  }

  isSuperadmin(): boolean {
    return this.als.getStore()?.isSuperadmin ?? false;
  }
}
