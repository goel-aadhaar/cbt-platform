-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExamStatus" ADD VALUE 'REVIEW';
ALTER TYPE "ExamStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" UUID,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewer_id" UUID,
ADD COLUMN     "submitted_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
