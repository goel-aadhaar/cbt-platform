-- Email OTP as a mandatory second factor for every non-student sign-in (§2.2).
-- Issued only AFTER the password verifies, so a code alone is not a login.
-- Only the sha256 of the code is stored.

CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN');

CREATE TABLE "otp_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
  "code_hash" TEXT NOT NULL,
  "allowed_roles" "Role"[],
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "user_agent" TEXT,
  "ip" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_challenges_user_id_created_at_idx" ON "otp_challenges"("user_id", "created_at");

ALTER TABLE "otp_challenges"
  ADD CONSTRAINT "otp_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
