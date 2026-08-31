-- Assessments (§ Assessment feature): a second exam workflow that reuses the
-- exact same Exam/Attempt/Result engine, distinguished only by `kind`.
--
-- `kind` defaults to 'MOCK_TEST', so every existing row is completely
-- unaffected by this migration — no backfill needed, no existing behavior
-- changes. New ASSESSMENT rows skip the review/approval columns entirely
-- (reviewerId/submittedAt/approvedById/approvedAt stay null) and instead use
-- `autoClosedAt`, set once by the scheduler when it closes the window and
-- triggers automatic evaluation/publication.

CREATE TYPE "ExamKind" AS ENUM ('MOCK_TEST', 'ASSESSMENT');

ALTER TABLE "exams" ADD COLUMN "kind" "ExamKind" NOT NULL DEFAULT 'MOCK_TEST';
ALTER TABLE "exams" ADD COLUMN "auto_closed_at" TIMESTAMP(3);

CREATE INDEX "exams_kind_status_end_at_idx" ON "exams"("kind", "status", "end_at");
