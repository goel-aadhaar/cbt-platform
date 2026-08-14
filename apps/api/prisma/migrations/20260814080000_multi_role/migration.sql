-- One account, several roles (§2.2).
--
-- A senior teacher who also administers the institute previously needed two
-- accounts with two email addresses, and could not be both at once under the
-- single-active-session rule.
--
-- Holding a role is separated from using one: `users.roles` is what an account
-- MAY act as, `sessions.active_role` is what it IS acting as right now. The
-- guard authorises against active_role alone, so a teacher-administrator
-- working in the teacher console cannot reach administrator routes.

-- 1. Every existing user keeps exactly the role they had.
ALTER TABLE "users" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
UPDATE "users" SET "roles" = ARRAY["role"]::"Role"[];

-- 2. Sessions carry the role they are acting as. Backfilled from the user's
--    single role BEFORE that column is dropped, so nobody signed in right now
--    is bounced to a role chooser mid-exam.
ALTER TABLE "sessions" ADD COLUMN "active_role" "Role";
UPDATE "sessions" s SET "active_role" = u."role" FROM "users" u WHERE u."id" = s."user_id";

-- 3. Now that both are backfilled, the single-role column goes. Keeping it
--    would leave two sources of truth for the same question.
ALTER TABLE "users" DROP COLUMN "role";

-- A user with no roles could not sign in and should never exist.
ALTER TABLE "users" ADD CONSTRAINT "users_roles_not_empty"
  CHECK (array_length("roles", 1) >= 1);

-- Staff listings filter by "has this role"; GIN indexes array containment.
CREATE INDEX "users_roles_idx" ON "users" USING GIN ("roles");
