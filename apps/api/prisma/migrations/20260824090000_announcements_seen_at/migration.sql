-- When the user last opened their announcements, for the unread badge.
--
-- Nullable with no default on purpose: NULL means "has never looked", which the
-- count treats as "everything published is unread". Backfilling it to now()
-- would silently mark every existing notice as already seen for every student.
ALTER TABLE "users" ADD COLUMN "announcements_seen_at" TIMESTAMP(3);
