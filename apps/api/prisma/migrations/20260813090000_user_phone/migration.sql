-- Self-service profile: a contact number users maintain themselves.
--
-- Nullable and with no backfill: nobody has one yet, and it is not required to
-- sit an exam. The invite flow does not collect it, so it stays NULL until the
-- user fills it in.
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
