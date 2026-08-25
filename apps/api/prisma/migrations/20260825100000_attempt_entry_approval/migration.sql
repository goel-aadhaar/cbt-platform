-- Exam entry approval (§ exam entry approval): a student's attempt now
-- starts life waiting on an admin instead of already running. The server
-- clock only starts once the student calls the begin endpoint from an
-- APPROVED row, so `started_at`/`expires_at` move from NOT NULL to
-- nullable — both are genuinely unknown before that moment. Existing rows
-- are untouched: every attempt already in the table has a real
-- started_at/expires_at and a status the new values never overlap with.
ALTER TYPE "AttemptStatus" ADD VALUE 'PENDING_APPROVAL' BEFORE 'IN_PROGRESS';
ALTER TYPE "AttemptStatus" ADD VALUE 'APPROVED' BEFORE 'IN_PROGRESS';
ALTER TYPE "AttemptStatus" ADD VALUE 'DENIED' BEFORE 'IN_PROGRESS';

ALTER TABLE "attempts"
  ALTER COLUMN "started_at" DROP NOT NULL,
  ALTER COLUMN "started_at" DROP DEFAULT,
  ALTER COLUMN "expires_at" DROP NOT NULL;

ALTER TABLE "attempts" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';

-- Entry-approval audit trail: who let the student in (or declined them) and
-- when, plus a free-text reason for a denial — same shape as the exam
-- force-end audit columns added earlier.
ALTER TABLE "attempts"
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by_id" UUID,
  ADD COLUMN "denied_at" TIMESTAMP(3),
  ADD COLUMN "denied_by_id" UUID,
  ADD COLUMN "denial_reason" TEXT;

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL,
  ADD CONSTRAINT "attempts_denied_by_id_fkey"
    FOREIGN KEY ("denied_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL;
