-- Leaving an exam via Logout discards the candidate's work but must still
-- consume their single attempt, so the row is kept in a terminal state that
-- evaluation ignores.
ALTER TYPE "AttemptStatus" ADD VALUE IF NOT EXISTS 'ABANDONED';
