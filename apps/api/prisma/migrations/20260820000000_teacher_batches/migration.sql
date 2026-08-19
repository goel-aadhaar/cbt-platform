-- CreateTable
CREATE TABLE "teacher_batches" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_batches_teacher_id_idx" ON "teacher_batches"("teacher_id");

-- CreateIndex
CREATE INDEX "teacher_batches_batch_id_idx" ON "teacher_batches"("batch_id");

-- CreateIndex
CREATE INDEX "teacher_batches_institute_id_idx" ON "teacher_batches"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_batches_teacher_id_batch_id_key" ON "teacher_batches"("teacher_id", "batch_id");

-- AddForeignKey
ALTER TABLE "teacher_batches" ADD CONSTRAINT "teacher_batches_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_batches" ADD CONSTRAINT "teacher_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_batches" ADD CONSTRAINT "teacher_batches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
