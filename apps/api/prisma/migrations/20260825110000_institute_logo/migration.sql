-- Institute branding (§ institute branding): an ADMIN can set their own
-- institute's logo. NULL means "no custom logo" — every surface falls back
-- to the platform's default mark, never a broken image.
ALTER TABLE "institutes" ADD COLUMN "logo_key" TEXT;
