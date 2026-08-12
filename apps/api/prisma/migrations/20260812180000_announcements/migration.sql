-- Updates & Announcements (§2.9). Staff-authored notices for the student
-- portal; tenant-scoped, optionally aimed at a single batch.

CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL_STUDENTS', 'BATCH');
CREATE TYPE "AnnouncementCategory" AS ENUM ('GENERAL', 'EXAM', 'RESULT', 'SCHEDULE', 'MAINTENANCE');

CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "AnnouncementCategory" NOT NULL DEFAULT 'GENERAL',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL_STUDENTS',
    "batch_id" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_institute_id_published_at_idx" ON "announcements"("institute_id", "published_at");
CREATE INDEX "announcements_batch_id_idx" ON "announcements"("batch_id");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
