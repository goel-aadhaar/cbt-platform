-- Files on notices (§2.12), and a way to tell a question diagram from a document.
--
-- Media has been images-only: a 5 MB cap and an allow-list of five image types,
-- which is right for a diagram that renders inside a question and wrong for a
-- timetable PDF. Rather than loosen those rules for everything — which would
-- offer PDFs in the question picker, where they cannot be rendered — each file
-- now says what it is for, and the rules follow from that.
--
-- Existing rows are all question diagrams, so IMAGE is both the default and a
-- correct backfill; nothing needs rewriting.
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'DOCUMENT');
ALTER TABLE "media" ADD COLUMN "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE';

-- Attachments are addressed by media key, exactly as question diagrams are, so
-- the storage backend can change without touching a single notice.
ALTER TABLE "announcements"
  ADD COLUMN "attachment_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
