-- CreateEnum
CREATE TYPE "ProctoringEventType" AS ENUM ('TAB_SWITCH', 'FULLSCREEN_EXIT', 'FOCUS_LOSS', 'COPY', 'PASTE', 'OTHER');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "violation_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "fullscreen_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_violations" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "proctoring_events" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "type" "ProctoringEventType" NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proctoring_events_attempt_id_idx" ON "proctoring_events"("attempt_id");

-- CreateIndex
CREATE INDEX "proctoring_events_institute_id_idx" ON "proctoring_events"("institute_id");

-- AddForeignKey
ALTER TABLE "proctoring_events" ADD CONSTRAINT "proctoring_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctoring_events" ADD CONSTRAINT "proctoring_events_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
