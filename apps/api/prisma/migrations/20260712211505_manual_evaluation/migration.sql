-- AlterEnum
ALTER TYPE "ExamQuestionScoring" ADD VALUE 'MANUAL';

-- CreateTable
CREATE TABLE "manual_scores" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_scores_exam_id_idx" ON "manual_scores"("exam_id");

-- CreateIndex
CREATE INDEX "manual_scores_institute_id_idx" ON "manual_scores"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "manual_scores_attempt_id_question_id_key" ON "manual_scores"("attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "manual_scores" ADD CONSTRAINT "manual_scores_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_scores" ADD CONSTRAINT "manual_scores_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
