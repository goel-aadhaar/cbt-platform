-- Daily Practice Papers, and retiring the ad-hoc "practice library" flag.
--
-- Two unrelated-looking changes landing together because the second only
-- becomes safe once the first exists: `questions.in_practice_library` was the
-- entire mechanism behind student practice (mark a question, then any
-- student could pull it loose by subject/chapter/topic — no name, no batch).
-- It is replaced by named, teacher-curated, batch-assigned DPPs, so once the
-- new tables exist and the application code no longer reads the flag, the
-- flag and its two audit columns are genuinely dead and are dropped here
-- rather than left to rot.
--
-- ORDER MATTERS: the new tables are created FIRST (so nothing is ever
-- mid-migration without somewhere to point), then `practice_sessions` gains
-- its optional `dpp_id`, and only THEN are the old columns dropped. There is
-- no backfill step for the drop — no DPP existed before this migration, so
-- there is nothing to carry forward into `dpp_questions`/`dpp_batches`; the
-- old flag's rows simply cease to mean anything, which is the point.

-- 1. dpps
CREATE TABLE IF NOT EXISTS "dpps" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "institute_id"  UUID NOT NULL,
    "title"         TEXT NOT NULL,
    "description"   TEXT,
    "subject_id"    UUID,
    "chapter_id"    UUID,
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dpps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dpps_institute_id_idx" ON "dpps"("institute_id");
CREATE INDEX IF NOT EXISTS "dpps_institute_id_subject_id_idx" ON "dpps"("institute_id", "subject_id");
CREATE INDEX IF NOT EXISTS "dpps_institute_id_is_active_idx" ON "dpps"("institute_id", "is_active");

ALTER TABLE "dpps" ADD CONSTRAINT "dpps_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dpps" ADD CONSTRAINT "dpps_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dpps" ADD CONSTRAINT "dpps_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dpps" ADD CONSTRAINT "dpps_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. dpp_questions
CREATE TABLE IF NOT EXISTS "dpp_questions" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "dpp_id"        UUID NOT NULL,
    "question_id"   UUID NOT NULL,
    "institute_id"  UUID NOT NULL,
    "order"         INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "dpp_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dpp_questions_dpp_id_question_id_key" ON "dpp_questions"("dpp_id", "question_id");
CREATE INDEX IF NOT EXISTS "dpp_questions_dpp_id_idx" ON "dpp_questions"("dpp_id");
CREATE INDEX IF NOT EXISTS "dpp_questions_question_id_idx" ON "dpp_questions"("question_id");

ALTER TABLE "dpp_questions" ADD CONSTRAINT "dpp_questions_dpp_id_fkey" FOREIGN KEY ("dpp_id") REFERENCES "dpps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dpp_questions" ADD CONSTRAINT "dpp_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. dpp_batches — same shape as exam_batches / resource_batches.
CREATE TABLE IF NOT EXISTS "dpp_batches" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "dpp_id"       UUID NOT NULL,
    "batch_id"     UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dpp_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dpp_batches_dpp_id_batch_id_key" ON "dpp_batches"("dpp_id", "batch_id");
CREATE INDEX IF NOT EXISTS "dpp_batches_dpp_id_idx" ON "dpp_batches"("dpp_id");
CREATE INDEX IF NOT EXISTS "dpp_batches_institute_id_idx" ON "dpp_batches"("institute_id");

ALTER TABLE "dpp_batches" ADD CONSTRAINT "dpp_batches_dpp_id_fkey" FOREIGN KEY ("dpp_id") REFERENCES "dpps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dpp_batches" ADD CONSTRAINT "dpp_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dpp_batches" ADD CONSTRAINT "dpp_batches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. practice_sessions gains an optional pointer to the named paper it's an
--    attempt at. Null stays valid for historical ad-hoc sessions.
ALTER TABLE "practice_sessions" ADD COLUMN IF NOT EXISTS "dpp_id" UUID;
CREATE INDEX IF NOT EXISTS "practice_sessions_student_id_dpp_id_idx" ON "practice_sessions"("student_id", "dpp_id");
CREATE INDEX IF NOT EXISTS "practice_sessions_dpp_id_idx" ON "practice_sessions"("dpp_id");
ALTER TABLE "practice_sessions" DROP CONSTRAINT IF EXISTS "practice_sessions_dpp_id_fkey";
ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_sessions_dpp_id_fkey"
  FOREIGN KEY ("dpp_id") REFERENCES "dpps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Retire the ad-hoc practice-library flag and its audit columns. No
--    backfill: DPP replaces this mechanism outright rather than migrating
--    its state, and the application no longer reads any of these three.
DROP INDEX IF EXISTS "questions_institute_id_in_practice_library_idx";
ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_practice_added_by_id_fkey";
ALTER TABLE "questions" DROP COLUMN IF EXISTS "in_practice_library";
ALTER TABLE "questions" DROP COLUMN IF EXISTS "practice_added_by_id";
ALTER TABLE "questions" DROP COLUMN IF EXISTS "practice_added_at";
