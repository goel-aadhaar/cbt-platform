-- Resources gain a chapter, a type (file or YouTube), and many batches.
--
-- Three changes to one table, done in one migration because they are one
-- feature: material is now filed Subject > Chapter > Resource, can be a
-- YouTube video instead of a file, and is shared with a SET of batches rather
-- than exactly one.
--
-- ORDER MATTERS: batch_id is copied into the join table BEFORE it is dropped.
-- Reversing those two steps would silently unshare every existing resource —
-- they would still exist, and no student would be able to reach them.

-- 1. Type. Existing rows are all files, which is what the default encodes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResourceType') THEN
    CREATE TYPE "ResourceType" AS ENUM ('FILE', 'YOUTUBE');
  END IF;
END $$;

ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "type" "ResourceType" NOT NULL DEFAULT 'FILE';
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "youtube_video_id" TEXT;
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "chapter_id" UUID;

-- media_key becomes optional: a YouTube resource has no file. Existing rows
-- keep theirs, and the service refuses a FILE without one.
ALTER TABLE "resources" ALTER COLUMN "media_key" DROP NOT NULL;

ALTER TABLE "resources" DROP CONSTRAINT IF EXISTS "resources_chapter_id_fkey";
ALTER TABLE "resources"
  ADD CONSTRAINT "resources_chapter_id_fkey"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. The join table.
CREATE TABLE IF NOT EXISTS "resource_batches" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "resource_batches_resource_id_batch_id_key" ON "resource_batches"("resource_id", "batch_id");
CREATE INDEX IF NOT EXISTS "resource_batches_resource_id_idx" ON "resource_batches"("resource_id");
CREATE INDEX IF NOT EXISTS "resource_batches_batch_id_idx" ON "resource_batches"("batch_id");

ALTER TABLE "resource_batches" ADD CONSTRAINT "resource_batches_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_batches" ADD CONSTRAINT "resource_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_batches" ADD CONSTRAINT "resource_batches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. BACKFILL, before the column goes. Every existing resource keeps reaching
--    exactly the batch it already reached.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'batch_id'
  ) THEN
    INSERT INTO "resource_batches" ("id", "resource_id", "batch_id", "institute_id")
    SELECT gen_random_uuid(), r."id", r."batch_id", r."institute_id"
      FROM "resources" r
     WHERE r."batch_id" IS NOT NULL
    ON CONFLICT ("resource_id", "batch_id") DO NOTHING;
  END IF;
END $$;

-- 4. Only now retire the single-batch column.
DROP INDEX IF EXISTS "resources_institute_id_batch_id_idx";
ALTER TABLE "resources" DROP CONSTRAINT IF EXISTS "resources_batch_id_fkey";
ALTER TABLE "resources" DROP COLUMN IF EXISTS "batch_id";

-- 5. Indexes for the new access paths (chapter drill-down, type filter,
--    newest-first ordering).
CREATE INDEX IF NOT EXISTS "resources_institute_id_chapter_id_idx" ON "resources"("institute_id", "chapter_id");
CREATE INDEX IF NOT EXISTS "resources_institute_id_type_idx" ON "resources"("institute_id", "type");
CREATE INDEX IF NOT EXISTS "resources_institute_id_created_at_idx" ON "resources"("institute_id", "created_at");
