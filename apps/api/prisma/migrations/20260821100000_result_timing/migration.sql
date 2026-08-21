-- Richer student results (§2.8): per-question time analysis and an honest
-- "results released at" timestamp.

-- Cumulative on-screen time per question, summed from client-reported deltas.
-- Milliseconds (not the seconds `attempt_section_times` uses) because a
-- per-question figure is often only a few seconds and "fastest/slowest
-- question" needs finer resolution. Nullable rather than DEFAULT 0: attempts
-- taken before this shipped genuinely have no timing, which is not the same
-- claim as "answered instantly".
ALTER TABLE "responses" ADD COLUMN "time_spent_ms" INTEGER;

-- `published` is a boolean that flips both ways, so it cannot answer "since
-- when". Cleared again when an admin holds the result back.
ALTER TABLE "results" ADD COLUMN "published_at" TIMESTAMP(3);

-- Backfill: results already visible got that way at some point in the past, and
-- `updated_at` is the closest honest proxy the row carries. Only touches rows
-- that are already published, so held results correctly stay NULL.
UPDATE "results" SET "published_at" = "updated_at" WHERE "published" = true;
