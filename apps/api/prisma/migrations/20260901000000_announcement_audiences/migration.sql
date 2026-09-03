-- Announcements gain a second audience (teachers) and multi-target narrowing.
--
-- The old model could express exactly two things: "all students", or "one
-- batch". The new one is two booleans plus join tables, so a single notice can
-- go to students and teachers at once, narrowed to several batches and/or
-- several named teachers.
--
-- ORDER MATTERS: the new columns and tables are populated from the old ones
-- BEFORE anything is dropped. Doing it the other way round would silently
-- retarget every existing notice at the default (all students) — including the
-- batch-specific ones, which would then reach students they were never for.

-- 1. New audience flags. `to_students` defaults true, which is already correct
--    for every existing row: both old audiences were student audiences.
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "to_students" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "to_teachers" BOOLEAN NOT NULL DEFAULT false;

-- 2. Join tables.
CREATE TABLE IF NOT EXISTS "announcement_batches" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "announcement_teachers" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_teachers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_batches_announcement_id_batch_id_key" ON "announcement_batches"("announcement_id", "batch_id");
CREATE INDEX IF NOT EXISTS "announcement_batches_announcement_id_idx" ON "announcement_batches"("announcement_id");
CREATE INDEX IF NOT EXISTS "announcement_batches_batch_id_idx" ON "announcement_batches"("batch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_teachers_announcement_id_teacher_id_key" ON "announcement_teachers"("announcement_id", "teacher_id");
CREATE INDEX IF NOT EXISTS "announcement_teachers_announcement_id_idx" ON "announcement_teachers"("announcement_id");
CREATE INDEX IF NOT EXISTS "announcement_teachers_teacher_id_idx" ON "announcement_teachers"("teacher_id");

ALTER TABLE "announcement_batches" ADD CONSTRAINT "announcement_batches_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_batches" ADD CONSTRAINT "announcement_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_batches" ADD CONSTRAINT "announcement_batches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcement_teachers" ADD CONSTRAINT "announcement_teachers_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_teachers" ADD CONSTRAINT "announcement_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_teachers" ADD CONSTRAINT "announcement_teachers_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. BACKFILL, before the old columns go. Every BATCH notice becomes a
--    to_students notice narrowed to that one batch. ALL_STUDENTS notices need
--    no row at all — no rows is precisely how "everyone" is expressed.
--    Guarded on the column still existing so a re-run is harmless.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'batch_id'
  ) THEN
    INSERT INTO "announcement_batches" ("id", "announcement_id", "batch_id", "institute_id")
    SELECT gen_random_uuid(), a."id", a."batch_id", a."institute_id"
      FROM "announcements" a
     WHERE a."batch_id" IS NOT NULL
    ON CONFLICT ("announcement_id", "batch_id") DO NOTHING;
  END IF;
END $$;

-- 4. Only now retire the old shape.
DROP INDEX IF EXISTS "announcements_batch_id_idx";
ALTER TABLE "announcements" DROP CONSTRAINT IF EXISTS "announcements_batch_id_fkey";
ALTER TABLE "announcements" DROP COLUMN IF EXISTS "batch_id";
ALTER TABLE "announcements" DROP COLUMN IF EXISTS "audience";
DROP TYPE IF EXISTS "AnnouncementAudience";
