-- CreateTable
CREATE TABLE "attempt_section_times" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_section_times_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_section_times_attempt_id_idx" ON "attempt_section_times"("attempt_id");

-- CreateIndex
CREATE INDEX "attempt_section_times_institute_id_idx" ON "attempt_section_times"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_section_times_attempt_id_section_id_key" ON "attempt_section_times"("attempt_id", "section_id");

-- AddForeignKey
ALTER TABLE "attempt_section_times" ADD CONSTRAINT "attempt_section_times_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_section_times" ADD CONSTRAINT "attempt_section_times_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
