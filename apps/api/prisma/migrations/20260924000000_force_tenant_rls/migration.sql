-- Tenant isolation layer 2 — RLS enforcement (DEF-001).
--
-- 20260712120000_tenant_rls ENABLEd row security on every tenant table but
-- never FORCEd it, so the application's own connecting role (postgres) —
-- which OWNS every one of these tables — was silently exempt from the
-- policies it created. This was confirmed empirically against production on
-- 2026-09-23/24: a plain `SELECT count(*) FROM students` as the app's own DB
-- role, with no `app.current_institute_id` GUC set, returned every student
-- across every institute.
--
-- The connecting role does NOT need to change (confirmed: it is not a
-- superuser and has no BYPASSRLS — table ownership was the only bypass
-- path), so `FORCE ROW LEVEL SECURITY` alone is sufficient: per Postgres
-- semantics, a force-enabled table's policies bind even for its owner.
--
-- The other half — actually setting `app.current_institute_id` per query —
-- is now wired at the application layer: apps/api/src/database/
-- tenant-rls.extension.ts (a Prisma Client Extension, applied to the
-- injected PrismaService in database.module.ts) for the ~150 ordinary call
-- sites, plus one manual `set_config` at each of the ~20 call sites that
-- already run their own explicit `$transaction(...)` (Prisma does not
-- support nested transactions, so those set the GUC themselves via
-- PrismaService.raw rather than relying on the extension). See both files'
-- doc-comments for the detail.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'attempts', 'audit_logs', 'batches', 'classes', 'exam_batches',
    'exam_questions', 'exam_sections', 'exams', 'programs', 'questions',
    'responses', 'results', 'students'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
