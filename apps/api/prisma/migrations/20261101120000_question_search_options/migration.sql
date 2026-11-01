-- Search only read the statement, so a word that appears only in an option found
-- nothing. Options join the vector at the lowest weight: a question that is about
-- a term ranks above one that merely offers it as an answer. As before, a generated
-- column is only recomputed when it is rebuilt.
--
-- Both functions also pin search_path. pg_dump clears it while restoring, and
-- questions_search_tsv could then not find question_text_plain, so a dump of this
-- database could not recreate the questions table at all.
DROP INDEX "questions_search_vector_idx";
ALTER TABLE "questions" DROP COLUMN "search_vector";
DROP FUNCTION questions_search_tsv(text, text, text, text, text[]);

CREATE FUNCTION question_options_plain(p_options jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path FROM CURRENT AS $$
  SELECT coalesce(string_agg(question_text_plain(opt ->> 'text'), ' '), '')
  FROM jsonb_array_elements(
    CASE jsonb_typeof(p_options) WHEN 'array' THEN p_options ELSE '[]'::jsonb END
  ) AS opt;
$$;

CREATE FUNCTION questions_search_tsv(
  p_statement text,
  p_options   jsonb,
  p_subject   text,
  p_chapter   text,
  p_topic     text,
  p_tags      text[]
) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path FROM CURRENT AS $$
  SELECT setweight(to_tsvector('english', question_text_plain(p_statement)), 'A')
      || setweight(to_tsvector('english', coalesce(p_subject, '') || ' ' ||
                                          coalesce(p_chapter, '') || ' ' ||
                                          coalesce(p_topic, '')), 'B')
      || setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'C')
      || setweight(to_tsvector('english', question_options_plain(p_options)), 'D');
$$;

ALTER TABLE "questions" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    questions_search_tsv("statement", "options", "subject", "chapter", "topic", "tags")
  ) STORED;

CREATE INDEX "questions_search_vector_idx" ON "questions" USING GIN ("search_vector");
