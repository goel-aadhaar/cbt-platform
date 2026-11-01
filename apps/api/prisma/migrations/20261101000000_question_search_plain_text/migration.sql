-- Question text is stored as inline HTML, so "CO<sub>2</sub>" indexed as the two
-- words "co" and "2" and a search for CO2 found nothing. Index the words a person
-- reads instead. A generated column is only recomputed when it is rebuilt, so it
-- is dropped and added back rather than just replacing the function.
DROP INDEX "questions_search_vector_idx";
ALTER TABLE "questions" DROP COLUMN "search_vector";

CREATE OR REPLACE FUNCTION question_text_plain(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p_text, ''), '<br\s*/?>', ' ', 'gi'),
             '<[^>]*>', '', 'g'),
           '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+);', ' ', 'gi');
$$;

CREATE OR REPLACE FUNCTION questions_search_tsv(
  p_statement text,
  p_subject   text,
  p_chapter   text,
  p_topic     text,
  p_tags      text[]
) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('english', question_text_plain(p_statement)), 'A')
      || setweight(to_tsvector('english', coalesce(p_subject, '') || ' ' ||
                                          coalesce(p_chapter, '') || ' ' ||
                                          coalesce(p_topic, '')), 'B')
      || setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'C');
$$;

ALTER TABLE "questions" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    questions_search_tsv("statement", "subject", "chapter", "topic", "tags")
  ) STORED;

CREATE INDEX "questions_search_vector_idx" ON "questions" USING GIN ("search_vector");
