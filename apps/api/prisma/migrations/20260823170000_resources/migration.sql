-- Study material shared with a batch (§2.12).
--
-- Grouped by subject so it sits in the same taxonomy the question bank uses: a
-- student looking for "Physics notes" finds them under Physics rather than in a
-- flat list of filenames. Addressed to a batch, because that is the unit a
-- teacher actually teaches, and because it makes the permission question
-- unambiguous — a nullable batch would leave "who may download this" open at
-- exactly the point where it must not be.
--
-- The bytes stay in the media library and are referenced by key, like question
-- diagrams and notice attachments. No URL is stored anywhere, so the storage
-- backend can change without touching a single shared resource.
CREATE TABLE "resources" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "institute_id"  UUID         NOT NULL,
  "subject_id"    UUID         NOT NULL,
  "batch_id"      UUID         NOT NULL,
  "title"         TEXT         NOT NULL,
  "description"   TEXT,
  "media_key"     TEXT         NOT NULL,
  "created_by_id" UUID         NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- Cascades match the rest of the schema: a deleted tenant, subject, batch or
-- author takes its rows with it. A resource filed under a deleted subject would
-- be unreachable through the only UI that lists them.
ALTER TABLE "resources"
  ADD CONSTRAINT "resources_institute_id_fkey" FOREIGN KEY ("institute_id")
    REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "resources_subject_id_fkey" FOREIGN KEY ("subject_id")
    REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "resources_batch_id_fkey" FOREIGN KEY ("batch_id")
    REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "resources_created_by_id_fkey" FOREIGN KEY ("created_by_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The two ways this table is read: a subject's shelf, and a batch's shelf.
CREATE INDEX "resources_institute_id_subject_id_idx" ON "resources"("institute_id", "subject_id");
CREATE INDEX "resources_institute_id_batch_id_idx"   ON "resources"("institute_id", "batch_id");
