-- Instruction templates: reusable candidate-facing instructions text an admin
-- authors once ("Standard NEET Rules", "JEE Advanced Rules") that a teacher
-- can drop into an exam's `instructions` while authoring — a one-time copy,
-- not a live link, so editing/archiving a template never changes an exam
-- that already used it.

CREATE TABLE "instruction_templates" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instruction_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "instruction_templates_institute_id_name_key"
    ON "instruction_templates"("institute_id", "name");
CREATE INDEX "instruction_templates_institute_id_idx"
    ON "instruction_templates"("institute_id");

ALTER TABLE "instruction_templates"
    ADD CONSTRAINT "instruction_templates_institute_id_fkey"
    FOREIGN KEY ("institute_id") REFERENCES "institutes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "instruction_templates"
    ADD CONSTRAINT "instruction_templates_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
