-- Optional pass/fail threshold for an exam, shown on results (§ exam authoring).
-- Nullable: a paper with no pass/fail line (e.g. a diagnostic test) omits it.

ALTER TABLE "exams" ADD COLUMN "passing_marks" INTEGER;
