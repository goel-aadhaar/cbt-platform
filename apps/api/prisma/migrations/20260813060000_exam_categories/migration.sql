-- Exam categories: an institute's catalogue of paper types ("JEE Mock Test",
-- "Physics Practice Test"). Administrators curate the catalogue; teachers pick
-- one when authoring, and on approval the paper is numbered within it.
--
-- Additive only. `category_id` is nullable so every exam authored before this
-- migration keeps working, and `category_sequence` is nullable because an
-- unapproved paper has no number yet.

CREATE TABLE "exam_categories" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_categories_pkey" PRIMARY KEY ("id")
);

-- One name per tenant, so "the next number in this category" is unambiguous.
CREATE UNIQUE INDEX "exam_categories_institute_id_name_key"
    ON "exam_categories"("institute_id", "name");
CREATE INDEX "exam_categories_institute_id_idx"
    ON "exam_categories"("institute_id");

ALTER TABLE "exam_categories"
    ADD CONSTRAINT "exam_categories_institute_id_fkey"
    FOREIGN KEY ("institute_id") REFERENCES "institutes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exam_categories"
    ADD CONSTRAINT "exam_categories_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exams" ADD COLUMN "category_id" UUID;
ALTER TABLE "exams" ADD COLUMN "category_sequence" INTEGER;

CREATE INDEX "exams_institute_id_category_id_idx"
    ON "exams"("institute_id", "category_id");

-- SET NULL rather than CASCADE: retiring a category must never delete the
-- exams — and therefore the results — that were run under it.
ALTER TABLE "exams"
    ADD CONSTRAINT "exams_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "exam_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
