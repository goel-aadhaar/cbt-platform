-- Class -> Subject -> Unit -> Chapter -> Topic. A subject may belong to one of
-- the institute's existing classes (classes table), which lets the same subject
-- name exist under different classes as separate trees. class_id is optional:
-- existing subjects stay valid with no class. Uniqueness of a name among
-- subjects that have no class is enforced in the service (Postgres treats NULLs
-- in a unique index as distinct).

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN "class_id" UUID;

-- DropIndex
DROP INDEX "subjects_institute_id_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "subjects_institute_id_class_id_name_key" ON "subjects"("institute_id", "class_id", "name");
CREATE INDEX "subjects_class_id_idx" ON "subjects"("class_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
