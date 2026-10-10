-- Chapter-wise weightage target for an exam section (informational; scoring
-- never reads it).

-- AlterTable
ALTER TABLE "exam_sections" ADD COLUMN "blueprint" JSONB;
