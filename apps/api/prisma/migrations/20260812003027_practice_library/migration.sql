-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "in_practice_library" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "practice_added_at" TIMESTAMP(3),
ADD COLUMN     "practice_added_by_id" UUID;

-- CreateIndex
CREATE INDEX "questions_institute_id_in_practice_library_idx" ON "questions"("institute_id", "in_practice_library");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_practice_added_by_id_fkey" FOREIGN KEY ("practice_added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
