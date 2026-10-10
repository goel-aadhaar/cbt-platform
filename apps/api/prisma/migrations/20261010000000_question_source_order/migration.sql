-- Keep the original order and numbering of uploaded questions, and link each
-- question to the import run that created it so the upload can be reviewed as
-- one list. All columns are nullable: questions typed in by hand have none.

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "source_seq" INTEGER,
ADD COLUMN "source_label" TEXT,
ADD COLUMN "import_run_id" UUID;

-- CreateIndex
CREATE INDEX "questions_import_run_id_source_seq_idx" ON "questions"("import_run_id", "source_seq");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
