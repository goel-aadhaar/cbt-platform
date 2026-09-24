import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { TenantContextService } from '../modules/auth/tenant/tenant-context.service';

/**
 * The same bypass/institute decision `tenantRlsExtension` makes automatically,
 * exposed for the handful of call sites that run their own explicit
 * `$transaction(...)` (see PrismaService.raw's doc-comment) and so must set
 * the GUC themselves, through the SAME un-extended `raw` client, as that
 * transaction's first statement. Centralised here rather than duplicated at
 * each site so there is exactly one place that decides bypass vs. scoped.
 */
export function tenantSetConfigStatement(
  raw: Pick<PrismaClient, '$executeRaw'>,
  tenantContext: TenantContextService,
) {
  const ctx = tenantContext.get();
  return !ctx || ctx.isSuperadmin
    ? raw.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`
    : raw.$executeRaw`SELECT set_config('app.current_institute_id', ${ctx.instituteId}, TRUE)`;
}

/**
 * Prisma Client Extension that makes the DB-layer RLS policies added by
 * `20260712120000_tenant_rls` (staged, previously inert — see DEF-001) and
 * `FORCE`d by the migration alongside this file actually bind, without
 * touching any of the ~150 ordinary `this.prisma.model.op(...)` call sites
 * across the app.
 *
 * Follows Prisma's own official pattern for RLS
 * (github.com/prisma/prisma-client-extensions, row-level-security example)
 * exactly: every intercepted operation is batched, via `$transaction`, with
 * a `set_config(..., TRUE)` — the `TRUE` (is_local) makes it behave like
 * `SET LOCAL`, i.e. automatically undone when that transaction ends, so it
 * can never leak between requests sharing a pooled connection.
 *
 * The `set_config` calls are issued through the OUTER `prisma` parameter
 * (captured by `Prisma.defineExtension`, before this extension is applied) —
 * never through the extended client — so they don't recursively trigger this
 * same `$allOperations` hook.
 *
 * NOT applied automatically to calls already inside an app-level
 * `$transaction(...)` (Prisma does not support nested transactions, and the
 * batch-array form would silently split one atomic multi-row write into
 * several independent ones). Those call sites set the GUC themselves, via
 * PrismaService's exposed `raw` client — see PrismaService.raw and its
 * usages.
 */
export function tenantRlsExtension(tenantContext: TenantContextService) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      name: 'tenant-rls',
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            // No context at all only happens for genuinely public routes
            // (login, health) — those never touch an RLS-protected table
            // (users/sessions/institutes are excluded from RLS by design;
            // see the original migration's own comment). Superadmin is a
            // real cross-tenant actor by product design. Both bypass.
            const [, result] = await prisma.$transaction([
              tenantSetConfigStatement(prisma, tenantContext),
              query(args),
            ]);
            return result;
          },
        },
      },
    }),
  );
}
