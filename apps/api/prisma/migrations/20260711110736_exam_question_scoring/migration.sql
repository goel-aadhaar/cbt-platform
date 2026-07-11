-- CreateEnum
CREATE TYPE "ExamQuestionScoring" AS ENUM ('NORMAL', 'BONUS', 'DROPPED');

-- AlterTable
ALTER TABLE "exam_questions" ADD COLUMN     "scoring" "ExamQuestionScoring" NOT NULL DEFAULT 'NORMAL';
