-- A rejected question or exam is no longer indistinguishable from an unfinished
-- one (§2.4/§2.3).
--
-- Rejection previously set the status back to DRAFT, which is where a teacher's
-- half-written work also lives. Something an admin had actively sent back —
-- with a reason attached — landed in the same pile as everything not started,
-- so the one item needing attention was the hardest to find.
--
-- Purely additive: no existing row changes status here. Anything rejected
-- before this migration stays DRAFT, which is what it has been all along and
-- is still editable and re-submittable. Only rejections from now on are marked.
--
-- `ADD VALUE` is safe inside a transaction on PostgreSQL 12+ so long as the new
-- value is not also *used* in the same transaction, which is why this file only
-- declares them and backfills nothing.
ALTER TYPE "QuestionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
