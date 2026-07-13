-- Tenant isolation layer 2 — Row-Level Security (§ deferred RLS milestone).
--
-- STAGED, NOT YET ENFORCED. The application connects as the table OWNER
-- (neondb_owner), and non-FORCE row security is bypassed by a table's owner, so
-- these policies have ZERO runtime effect today. They activate at deployment
-- time by connecting the app as a dedicated NON-OWNER role (and/or adding
-- `FORCE ROW LEVEL SECURITY`), once RDS + a transaction-mode pooler + per-request
-- GUC wiring are in place.
--
-- Contract: each request sets `app.current_institute_id` (uuid) on its
-- connection; superadmin sets `app.bypass_rls = 'on'` to see across tenants.
-- With no GUC set, app_current_institute() is NULL so every policy denies by
-- default (fail-closed).
--
-- NOTE: users/sessions are intentionally excluded — auth infrastructure is
-- queried before any tenant context exists (e.g. login by email), so those
-- tables need bespoke policies designed alongside the deploy role setup.

CREATE OR REPLACE FUNCTION app_current_institute() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_institute_id', true), '')::uuid
  $$;

CREATE OR REPLACE FUNCTION app_rls_bypassed() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
  $$;

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
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (app_rls_bypassed() OR institute_id = app_current_institute()) '
      'WITH CHECK (app_rls_bypassed() OR institute_id = app_current_institute())',
      t
    );
  END LOOP;
END $$;
