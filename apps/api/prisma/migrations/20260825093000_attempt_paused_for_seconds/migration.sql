-- Per-attempt pause-window accumulator. NULL (not 0) on attempts that
-- never experienced a pause, so a future "did you pause this?" query
-- answers truthfully without rounding zeros.
ALTER TABLE "attempts" ADD COLUMN "paused_for_seconds" INT;
