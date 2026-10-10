-- Subject -> Unit -> Chapter -> Topic. A unit groups chapters inside a subject.
-- chapters.unit_id is optional: existing chapters stay unassigned (no units are
-- invented for them) and keep their subject link and uniqueness unchanged.

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN "unit_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "units_subject_id_name_key" ON "units"("subject_id", "name");
CREATE INDEX "units_institute_id_idx" ON "units"("institute_id");
CREATE INDEX "units_subject_id_idx" ON "units"("subject_id");
CREATE INDEX "chapters_unit_id_idx" ON "chapters"("unit_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant isolation for the new table, same policy as the original tenant tables
-- (20260712120000_tenant_rls) including FORCE (20260924000000_force_tenant_rls).
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "units";
CREATE POLICY tenant_isolation ON "units"
  USING (app_rls_bypassed() OR institute_id = app_current_institute())
  WITH CHECK (app_rls_bypassed() OR institute_id = app_current_institute());
