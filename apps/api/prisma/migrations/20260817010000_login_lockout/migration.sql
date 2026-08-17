-- Per-account brute-force lockout (§2.2). Deliberately account-scoped, not
-- IP-scoped: an institute's staff share an office/lab network, so an IP-keyed
-- limit here would lock out a whole building over one person's typos.
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP(3);
