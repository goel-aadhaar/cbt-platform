-- DB-level backstop for exam category numbering ("Physics Practice Test - 2").
-- The application already computes the next sequence number by reading the
-- current MAX and writing MAX+1 (exam-categories.service.ts claimNextSequence),
-- which has a read-then-write race: two exams in the same category approved
-- at the same instant can both read the same MAX and both claim the same
-- number. NULLs (exams with no category, or not yet approved) are exempt —
-- Postgres treats every NULL as distinct in a unique index, so this only
-- fires once a real (category, sequence) pair would actually collide.
CREATE UNIQUE INDEX "exams_category_id_category_sequence_key" ON "exams"("category_id", "category_sequence");
