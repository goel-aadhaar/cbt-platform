-- Media module (§2.7). The file lives in object storage; the database holds
-- only the reference key and metadata. Tenant-scoped like everything else.

CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "alt_text" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_institute_id_key_key" ON "media"("institute_id", "key");
CREATE INDEX "media_institute_id_created_at_idx" ON "media"("institute_id", "created_at");

ALTER TABLE "media" ADD CONSTRAINT "media_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
