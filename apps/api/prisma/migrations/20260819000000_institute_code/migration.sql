-- 4-digit institute code, embedded in every student roll number this
-- institute issues going forward ({yy}{code}{sequence}). Nullable-first so
-- existing rows aren't blocked, backfilled with a distinct code each, then
-- locked to NOT NULL + UNIQUE — matches the app-level generator's own
-- format (4 digits, zero-padded, no other constraint on the value).
ALTER TABLE "institutes" ADD COLUMN "code" VARCHAR(4);

-- Backfill: assigns each pre-existing institute a distinct code via a
-- multiplicative permutation of its row index (37 is coprime to 10000, so
-- rn -> (rn*37+123) mod 10000 is a bijection on [0,9999) — collision-free
-- for any realistic number of pre-existing institutes).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn
  FROM "institutes"
)
UPDATE "institutes" i
SET "code" = LPAD(((numbered.rn * 37 + 123) % 10000)::text, 4, '0')
FROM numbered
WHERE i.id = numbered.id;

ALTER TABLE "institutes" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "institutes" ADD CONSTRAINT "institutes_code_key" UNIQUE ("code");
