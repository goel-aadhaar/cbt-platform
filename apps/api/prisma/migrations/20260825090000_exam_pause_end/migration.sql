-- Exam lifecycle: PAUSED state + force-end audit + per-attempt pause bookkeeping.
--
-- PAUSED is added between PUBLISHED and ARCHIVED. Choosing an explicit value
-- rather than overloading ARCHIVED matters: ARCHIVED is "this exam is done
-- and will not run again", whereas PAUSED is "this exam is mid-window but
-- temporarily held by an admin". A wrong button-press from the admin side
-- should never silently make a live exam vanish from candidates; the
-- divergence is what gives the UI room to show a clear "held" state without
-- publishing incorrect semantics.
ALTER TYPE "ExamStatus" ADD VALUE 'PAUSED' BEFORE 'ARCHIVED';

-- Audit columns on the exam itself: an admin ending a live exam is exactly the
-- kind of action that becomes a support ticket, so the row needs to carry the
-- "who and when" plus a free-text reason. Nullable — a regular PUBLISHED
-- exam has no reason.
ALTER TABLE "exams"
  ADD COLUMN "force_ended_at"   TIMESTAMP(3),
  ADD COLUMN "force_ended_by_id" UUID,
  ADD COLUMN "pause_reason"      TEXT;

ALTER TABLE "exams"
  ADD CONSTRAINT "exams_force_ended_by_id_fkey"
    FOREIGN KEY ("force_ended_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL;

-- Per-attempt pause accumulation. NULL, not 0, so the result page can
-- distinguish "exam ran clean" from "exam was paused for 12 minutes" — a
-- candidate reporting a time loss who is told their attempt has no pause
-- record has not been told the answer to the wrong question.
ALTER TABLE "attempts" ADD COLUMN "paused_for_seconds" INT;
