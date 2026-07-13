# Tenant isolation — Layer 2 (Row-Level Security)

Multi-tenant isolation is defense-in-depth:

- **Layer 1 (active): application scoping.** Every service filters queries by
  `institute_id` taken from `TenantContextService` (AsyncLocalStorage, populated
  from the JWT). Verified end-to-end (cross-tenant list `[]`, get `404`).
- **Layer 2 (staged): PostgreSQL Row-Level Security.** A database-level backstop
  so that even a service that forgot to scope a query cannot return another
  tenant's rows. Added by migration `20260712120000_tenant_rls`.

## What the migration created

Two helper functions and a `tenant_isolation` policy on the 13 tenant-owned
tables (`attempts, audit_logs, batches, classes, exam_batches, exam_questions,
exam_sections, exams, programs, questions, responses, results, students`):

```sql
app_current_institute() -- current_setting('app.current_institute_id')::uuid, or NULL
app_rls_bypassed()      -- current_setting('app.bypass_rls') = 'on'

CREATE POLICY tenant_isolation ON <table>
  USING      (app_rls_bypassed() OR institute_id = app_current_institute())
  WITH CHECK (app_rls_bypassed() OR institute_id = app_current_institute());
```

With no GUC set, `app_current_institute()` is `NULL`, so the policy denies every
row (fail-closed). RLS is **ENABLE**d but **not FORCE**d.

## Why it is inert today (and safe)

The app connects as `neondb_owner`, which has the **`BYPASSRLS`** role attribute
(`SELECT rolbypassrls FROM pg_roles WHERE rolname='neondb_owner'` → `true`), and
a table owner is exempt from non-`FORCE`d RLS anyway. So the policies have **zero
runtime effect** for the current connection — confirmed by an app smoke test and
by the fact that every existing query still returns all its rows.

The policy logic itself is proven correct by running as a throwaway
`NOBYPASSRLS` role (rolled back): no GUC → 0 rows, GUC = institute → only that
institute's rows, `app.bypass_rls='on'` → all rows.

## Activating at deployment (RDS phase)

RLS should be turned on together with the production connection architecture:

1. **Dedicated app role.** Create a login role **without** `SUPERUSER` or
   `BYPASSRLS`, grant it `SELECT/INSERT/UPDATE/DELETE` on the app tables, and
   point the _runtime_ `DATABASE_URL` at it. Keep running **migrations** as the
   owner (`neondb_owner`/RDS master) so DDL still works.
2. **Per-connection GUC wiring.** Each request must set
   `app.current_institute_id` (and `app.bypass_rls='on'` for superadmin) on the
   _same_ connection its queries run on. With a pooled/serverless driver this
   means either a request-scoped transaction with `SET LOCAL`, or a
   transaction-mode pooler (PgBouncer/RDS Proxy) plus a per-query `set_config`.
   This is deferred precisely because it depends on this architecture; it also
   requires reconciling the app's existing `$transaction` usages.
3. **Auth tables.** `users` and `sessions` are intentionally **excluded** — they
   are read before any tenant context exists (login by email). Design their
   policies (or keep them app-scoped only) alongside step 1.
4. **`audit_logs` NULL institute.** Superadmin/pre-auth events are written with
   `institute_id = NULL`; the `WITH CHECK` clause would reject those under an
   enforced role. Add a carve-out (e.g. allow NULL when `app.bypass_rls='on'`)
   when enforcing.
5. Optionally `ALTER TABLE <t> FORCE ROW LEVEL SECURITY` if the app ever runs as
   the table owner.

Until then, layer-1 scoping remains the enforced isolation mechanism.
