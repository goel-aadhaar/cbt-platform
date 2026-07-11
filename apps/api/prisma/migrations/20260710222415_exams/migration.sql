-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResultPolicy" AS ENUM ('IMMEDIATE', 'ON_PUBLISH', 'BATCH_WISE');

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "program_id" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "calculator_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "result_policy" "ResultPolicy" NOT NULL DEFAULT 'ON_PUBLISH',
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sections" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "marks_correct" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "marks_wrong" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_batches" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_institute_id_idx" ON "exams"("institute_id");

-- CreateIndex
CREATE INDEX "exams_institute_id_status_idx" ON "exams"("institute_id", "status");

-- CreateIndex
CREATE INDEX "exam_sections_exam_id_idx" ON "exam_sections"("exam_id");

-- CreateIndex
CREATE INDEX "exam_sections_institute_id_idx" ON "exam_sections"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sections_exam_id_order_key" ON "exam_sections"("exam_id", "order");

-- CreateIndex
CREATE INDEX "exam_questions_exam_id_idx" ON "exam_questions"("exam_id");

-- CreateIndex
CREATE INDEX "exam_questions_section_id_idx" ON "exam_questions"("section_id");

-- CreateIndex
CREATE INDEX "exam_questions_institute_id_idx" ON "exam_questions"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_exam_id_question_id_key" ON "exam_questions"("exam_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_section_id_order_key" ON "exam_questions"("section_id", "order");

-- CreateIndex
CREATE INDEX "exam_batches_exam_id_idx" ON "exam_batches"("exam_id");

-- CreateIndex
CREATE INDEX "exam_batches_institute_id_idx" ON "exam_batches"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_batches_exam_id_batch_id_key" ON "exam_batches"("exam_id", "batch_id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
