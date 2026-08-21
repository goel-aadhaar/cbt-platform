import mammoth from 'mammoth';

import { ParsedImage, ParsedQuestion } from './ports/question-import.port';

const OPTION_RE = /^\(?([A-Ha-h])[).\]]\s+(.+)$/;
const ANSWER_RE = /^(?:answer|ans|correct answer|correct)\s*[:.-]?\s*(.+)$/i;
const META_RE =
  /^(subject|chapter|topic|difficulty|type|marks|negative(?:\s*marks)?|tags|explanation|language|exam\s*type)\s*[:.-]?\s*(.+)$/i;
// A new question starts with "Q:", "Q1.", "Question:", "1.", "1)" etc.
const STATEMENT_RE = /^(?:Q(?:uestion)?\s*\d*\s*[:.)]|\d+\s*[:.)])\s*(.*)$/i;

/** A token standing in for an image, in the text where the image appeared. */
const IMAGE_TOKEN_RE = /^\[\[IMAGE:(\d+)\]\]$/;

export interface DocxContent {
  text: string;
  images: ParsedImage[];
}

/**
 * Extract text AND images from a .docx.
 *
 * `extractRawText` — what this used to use — silently discards every image, so
 * a physics paper full of circuit diagrams imported as a set of questions that
 * cannot be answered, with nothing to say anything had been lost. Converting to
 * HTML instead lets mammoth hand us each image's bytes; we replace it with a
 * `[[IMAGE:n]]` token so the existing line-based parser can attribute it to the
 * question it appeared in, then flatten the HTML back to the same paragraph
 * lines the parser already expects.
 */
export async function extractDocxContent(buffer: Buffer): Promise<DocxContent> {
  const images: ParsedImage[] = [];

  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const body = await image.read();
        const token = `[[IMAGE:${images.length}]]`;
        images.push({
          token,
          contentType: image.contentType || 'image/png',
          buffer: Buffer.isBuffer(body) ? body : Buffer.from(body),
        });
        // The token has to survive into the text, so it goes in the alt rather
        // than the src — the src is stripped with the rest of the markup.
        return { src: '', alt: token };
      }),
    },
  );

  return { text: htmlToLines(html), images };
}

/**
 * Flatten mammoth's HTML into the newline-separated paragraphs the parser was
 * written against, keeping image tokens on lines of their own.
 */
function htmlToLines(html: string): string {
  return html
    .replace(/<img[^>]*alt="(\[\[IMAGE:\d+\]\])"[^>]*\/?>/g, '\n$1\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n/)
    .map((l) => l.trim())
    .join('\n');
}

/**
 * Text-only extraction, kept for callers that genuinely want no images.
 * @deprecated prefer {@link extractDocxContent} — this loses diagrams.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Parse a plain-text question paper (§2.4) into question blocks. Each question
 * begins with a `Q:`/`Q1.`/`1.` marker; option lines are `A) …`, the correct
 * choice is `Answer: …`, and any `Key: value` line (Subject, Chapter, Type, …)
 * sets per-question metadata. Lines that match nothing extend the statement.
 */
export function parseQuestions(
  text: string,
  images: ParsedImage[] = [],
): ParsedQuestion[] {
  const imageByToken = new Map(images.map((i) => [i.token, i]));
  const questions: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;

  const push = () => {
    if (current && current.statement.trim()) questions.push(current);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const statementStart = STATEMENT_RE.exec(line);
    const option = OPTION_RE.exec(line);
    const answer = ANSWER_RE.exec(line);
    const meta = META_RE.exec(line);

    if (statementStart) {
      push();
      current = {
        statement: statementStart[1].trim(),
        options: [],
        answer: null,
        meta: {},
        images: [],
      };
    } else if (!current) {
      // Preamble before the first question marker — ignore.
      continue;
    } else if (option) {
      current.options.push({
        key: option[1].toUpperCase(),
        text: option[2].trim(),
      });
    } else if (answer) {
      current.answer = answer[1].trim();
    } else if (IMAGE_TOKEN_RE.test(line)) {
      // Belongs to the question currently being built.
      const img = imageByToken.get(line);
      if (img) current.images.push(img);
    } else if (meta) {
      let key = meta[1].toLowerCase().replace(/\s+/g, '');
      // `Negative: 1` and `Negative Marks: 1` both mean the same thing, but the
      // regex produced two different keys and only one of them was ever read —
      // so the shorter spelling parsed successfully and was then ignored.
      if (key === 'negative') key = 'negativemarks';
      current.meta[key] = meta[2].trim();
    } else {
      // Continuation of the statement.
      current.statement = `${current.statement} ${line}`.trim();
    }
  }
  push();
  return questions;
}
