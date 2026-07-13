-- Full-text search (§2.6): a DB-generated tsvector over the searchable question
-- text, kept in sync automatically by PostgreSQL. Because to_tsvector with a
-- config *name* is only STABLE, a generated column needs an IMMUTABLE wrapper.
-- Weighted so the statement ranks highest (A), then classification (B), tags (C).
CREATE OR REPLACE FUNCTION questions_search_tsv(
  p_statement text,
  p_subject   text,
  p_chapter   text,
  p_topic     text,
  p_tags      text[]
) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('english', coalesce(p_statement, '')), 'A')
      || setweight(to_tsvector('english', coalesce(p_subject, '') || ' ' ||
                                          coalesce(p_chapter, '') || ' ' ||
                                          coalesce(p_topic, '')), 'B')
      || setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'C');
$$;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    questions_search_tsv("statement", "subject", "chapter", "topic", "tags")
  ) STORED;

-- CreateIndex
CREATE INDEX "questions_search_vector_idx" ON "questions" USING GIN ("search_vector");
