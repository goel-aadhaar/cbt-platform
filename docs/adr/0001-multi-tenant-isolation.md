# ADR 0001 — Multi-tenant isolation strategy

- **Status:** Accepted (2026-07-04)
- **Context:** Contract §2.1 requires strict tenant isolation — no institute may
  ever read another institute's data (question banks, students, results). The
  data model is rooted at `Institute`; every tenant-owned table carries
  `institute_id`.

## Decision

Enforce isolation with **defense in depth** — two independent layers:

1. **Application layer — Prisma Client extension (`$extends`).**
   A request-scoped tenant context (`AsyncLocalStorage`) is populated by the
   auth guard with the authenticated `institute_id`. A Prisma extension injects
   `institute_id` into the `where`/`data` of every query automatically, so
   application code cannot forget to scope.

2. **Database layer — PostgreSQL Row-Level Security (RLS).**
   Every tenant-owned table has RLS enabled with a policy of the form
   `institute_id = current_setting('app.current_institute')::uuid`. A per-request
   `SET LOCAL app.current_institute = '<id>'` (inside the request transaction)
   binds the connection to the tenant. Even a raw query or a bug in the app layer
   cannot cross tenants.

## Conventions for every tenant-owned model

- `institute_id UUID NOT NULL REFERENCES institutes(id)`, indexed.
- RLS enabled + tenant policy added in the same migration that creates the table.
- Never expose a query path that bypasses both layers.

## Consequences

- **Pros:** strongest possible guarantee; app-layer ergonomics + DB-enforced backstop.
- **Cons:** more work — RLS policies in every migration, GUC set per request,
  and care with connection pooling (GUC must be set per transaction on the pooled
  connection). Two layers to maintain.

## Implementation timing

Deferred until (a) authentication identifies the tenant and (b) the first
tenant-owned models exist. Built together at that point. The `Institute` root
table itself is not tenant-scoped (it *is* the tenant).
