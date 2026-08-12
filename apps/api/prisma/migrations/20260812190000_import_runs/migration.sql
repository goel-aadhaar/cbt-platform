-- Import history (§2.10). Records each student-CSV / question-docx run so the
-- Imports screen can show what happened, especially which rows failed.

CREATE TYPE "ImportKind" AS ENUM ('STUDENTS_CSV', 'QUESTIONS_DOCX');

CREATE TABLE "import_runs" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "imported_rows" INTEGER NOT NULL,
    "failed_rows" INTEGER NOT NULL,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "target" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_runs_institute_id_created_at_idx" ON "import_runs"("institute_id", "created_at");

ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
