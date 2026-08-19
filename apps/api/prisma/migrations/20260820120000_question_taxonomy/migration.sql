-- Question-bank taxonomy (§2.4): Subject -> Chapter -> Topic, admin-managed,
-- mirroring the Program -> Class -> Batch hierarchy. Existing questions keep
-- their free-text subject/chapter/topic/exam_type columns (subject/chapter/
-- topic feed the generated search_vector column and stay as denormalized
-- display+search text); this migration normalizes the distinct values that
-- already exist into real rows and points every question at them.

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_institute_id_name_key" ON "subjects"("institute_id", "name");
CREATE INDEX "subjects_institute_id_idx" ON "subjects"("institute_id");

CREATE UNIQUE INDEX "chapters_subject_id_name_key" ON "chapters"("subject_id", "name");
CREATE INDEX "chapters_institute_id_idx" ON "chapters"("institute_id");
CREATE INDEX "chapters_subject_id_idx" ON "chapters"("subject_id");

CREATE UNIQUE INDEX "topics_chapter_id_name_key" ON "topics"("chapter_id", "name");
CREATE INDEX "topics_institute_id_idx" ON "topics"("institute_id");
CREATE INDEX "topics_chapter_id_idx" ON "topics"("chapter_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chapters" ADD CONSTRAINT "chapters_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "topics" ADD CONSTRAINT "topics_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one Subject per distinct (institute_id, subject) already in use.
INSERT INTO "subjects" ("id", "institute_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), d."institute_id", d."subject", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "institute_id", "subject" FROM "questions") d;

-- Backfill: one Chapter per distinct (institute_id, subject, chapter), linked to its Subject.
INSERT INTO "chapters" ("id", "institute_id", "subject_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), d."institute_id", s."id", d."chapter", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "institute_id", "subject", "chapter" FROM "questions") d
JOIN "subjects" s ON s."institute_id" = d."institute_id" AND s."name" = d."subject";

-- Backfill: one Topic per distinct (institute_id, subject, chapter, topic) where topic is set.
INSERT INTO "topics" ("id", "institute_id", "chapter_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), d."institute_id", c."id", d."topic", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "institute_id", "subject", "chapter", "topic" FROM "questions" WHERE "topic" IS NOT NULL) d
JOIN "subjects" s ON s."institute_id" = d."institute_id" AND s."name" = d."subject"
JOIN "chapters" c ON c."subject_id" = s."id" AND c."name" = d."chapter";

-- AlterTable: add the new FK columns to questions (nullable until backfilled).
ALTER TABLE "questions" ADD COLUMN "subject_id" UUID;
ALTER TABLE "questions" ADD COLUMN "chapter_id" UUID;
ALTER TABLE "questions" ADD COLUMN "topic_id" UUID;
ALTER TABLE "questions" ADD COLUMN "exam_category_id" UUID;

-- Populate subject_id/chapter_id/topic_id by matching each question's existing
-- free-text values against the rows just created.
UPDATE "questions" q SET "subject_id" = s."id"
FROM "subjects" s
WHERE s."institute_id" = q."institute_id" AND s."name" = q."subject";

UPDATE "questions" q SET "chapter_id" = c."id"
FROM "chapters" c
JOIN "subjects" s ON c."subject_id" = s."id"
WHERE s."institute_id" = q."institute_id" AND s."name" = q."subject" AND c."name" = q."chapter";

UPDATE "questions" q SET "topic_id" = t."id"
FROM "topics" t
JOIN "chapters" c ON t."chapter_id" = c."id"
JOIN "subjects" s ON c."subject_id" = s."id"
WHERE s."institute_id" = q."institute_id" AND s."name" = q."subject"
  AND c."name" = q."chapter" AND t."name" = q."topic" AND q."topic" IS NOT NULL;

-- Best-effort match of the old free-text exam_type against an existing
-- ExamCategory of the same name; NULL (no match) is expected and tolerated,
-- same as Exam.category_id already is for pre-existing rows.
UPDATE "questions" q SET "exam_category_id" = ec."id"
FROM "exam_categories" ec
WHERE ec."institute_id" = q."institute_id" AND ec."name" = q."exam_type";

-- subject_id/chapter_id are now populated for every row (every question had a
-- non-null subject/chapter to begin with) — make them required.
ALTER TABLE "questions" ALTER COLUMN "subject_id" SET NOT NULL;
ALTER TABLE "questions" ALTER COLUMN "chapter_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_category_id_fkey" FOREIGN KEY ("exam_category_id") REFERENCES "exam_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "questions_subject_id_idx" ON "questions"("subject_id");
CREATE INDEX "questions_chapter_id_idx" ON "questions"("chapter_id");
CREATE INDEX "questions_exam_category_id_idx" ON "questions"("exam_category_id");

-- exam_type is not part of the generated search_vector column, so it can be
-- dropped outright now that exam_category_id replaces it.
ALTER TABLE "questions" DROP COLUMN "exam_type";
