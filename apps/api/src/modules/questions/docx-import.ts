import mammoth from 'mammoth';

import { injectEquationPlaceholders } from './docx-equations';
import { ParsedImage, ParsedQuestion } from './ports/question-import.port';

const OPTION_RE = /^\(?([A-Ha-h])[).\]]\s+(.+)$/;
// An option made only of an image: Word gives "A)" and then the image on the
// next line. Honoured only when that next line really is an image token.
const BARE_OPTION_RE = /^\(?([A-Ha-h])[).\]]$/;
const ANSWER_RE = /^(?:answer|ans|correct answer|correct)\s*[:.-]?\s*(.+)$/i;
const META_RE =
  /^(subject|chapter|topic|difficulty|type|marks|negative(?:\s*marks)?|tags|explanation|language|exam\s*type)\s*[:.-]?\s*(.+)$/i;
// A new question starts with "Q:", "Q1.", "Question 5.", "1.", "1)" etc.
// The marker number is captured (it becomes the question's source label).
const Q_MARKER_RE = /^Q(?:uestion)?\s*(\d+)?\s*[:.)]\s*(.*)$/i;
// A bare number needs whitespace AND text after the punctuation, so "2.5 m/s is
// the speed" and a lone "3)" on its own line stay part of the statement instead
// of starting a new question.
const NUM_MARKER_RE = /^(\d+)\s*[:.)]\s+(\S.*)$/;

/** A token standing in for an image, in the text where the image appeared. */
const IMAGE_TOKEN_RE = /^\[\[IMAGE:(\d+)\]\]$/;

export interface DocxContent {
  text: string;
  images: ParsedImage[];
  /** Word equations replaced by `[[EQ: …]]` placeholders. */
  equations: number;
}

/** Split a line into its question marker (if any) and the text after it. */
function matchStatementStart(
  line: string,
): { label?: string; statement: string } | null {
  const q = Q_MARKER_RE.exec(line);
  if (q) return { label: q[1] ? `Q${q[1]}` : undefined, statement: q[2] };
  const n = NUM_MARKER_RE.exec(line);
  if (n) return { label: n[1], statement: n[2] };
  return null;
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
  const prepared = await injectEquationPlaceholders(buffer);

  const { value: html } = await mammoth.convertToHtml(
    { buffer: prepared.buffer },
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

  return { text: htmlToLines(html), images, equations: prepared.equations };
}

/** Letter for the nth (0-based) option of an auto-lettered list: A, B, ... */
function optionLetter(n: number): string {
  return String.fromCharCode(65 + n);
}

/** Does this HTML's non-list text already carry explicit question markers? */
function hasExplicitMarkers(html: string): boolean {
  const outsideLists = html.replace(/<ol\b[\s\S]*?<\/ol>/gi, '\n');
  return flatten(outsideLists)
    .split('\n')
    .some((l) => matchStatementStart(l.trim()) !== null);
}

/**
 * Word's auto-numbered lists reach us as `<ol><li>` with the number nowhere in
 * the text, so a paper numbered by Word's list button never showed a single
 * question marker. Put the ordinal back, as visible text, before the tags go.
 *
 * - A document with NO typed markers numbers its top-level list items as the
 *   questions (the counter continues across separate lists, as Word's does
 *   when options or notes sit between the items) and letters nested items as
 *   options.
 * - A document that types its own "Q1."/"1." markers keeps them; a list there
 *   holds that question's options, so its items are lettered instead.
 * - An item whose text already starts with a marker or option letter is left
 *   alone.
 */
function numberOrderedLists(html: string): string {
  const explicit = hasExplicitMarkers(html);
  const stack: { ordered: boolean; n: number }[] = [];
  let question = 0;
  return html.replace(
    /<(\/?)(ol|ul|li)\b[^>]*>/gi,
    (match: string, close: string, rawTag: string, offset: number) => {
      const tag = rawTag.toLowerCase();
      if (close) {
        if (tag !== 'li') stack.pop();
        return match;
      }
      if (tag !== 'li') {
        stack.push({ ordered: tag === 'ol', n: 0 });
        return `\n${match}`;
      }
      const list = stack[stack.length - 1];
      if (!list?.ordered) return `\n${match}`;
      const peek = flatten(html.slice(offset + match.length, offset + 400))
        .trim()
        .split('\n')[0];
      if (matchStatementStart(peek) || OPTION_RE.test(peek)) {
        return `\n${match}`;
      }
      const index = list.n++;
      if (stack.length === 1 && !explicit) {
        question++;
        return `\n${match}${question}. `;
      }
      return index < 8 ? `\n${match}${optionLetter(index)}) ` : `\n${match}`;
    },
  );
}

function flatten(html: string): string {
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
    .replace(/&#39;/g, "'");
}

/**
 * Flatten mammoth's HTML into the newline-separated paragraphs the parser was
 * written against, keeping image tokens on lines of their own.
 */
export function htmlToLines(html: string): string {
  return flatten(numberOrderedLists(html))
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
  // Position of the block in the file, counted at every marker so a block that
  // is dropped (or later fails) still leaves its number behind.
  let seq = 0;

  const push = () => {
    if (!current) return;
    const hasContent =
      current.statement.trim() ||
      current.options.length > 0 ||
      current.images.length > 0;
    if (hasContent) questions.push(current);
  };

  // The option an image token would belong to: set by an option line, cleared
  // by anything else, so only an image sitting right after an option attaches
  // to it and an image anywhere else stays with the question.
  let lastOption: ParsedQuestion['options'][number] | null = null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const [i, line] of lines.entries()) {
    const statementStart = matchStatementStart(line);
    const option = OPTION_RE.exec(line);
    const bareOption =
      !option && IMAGE_TOKEN_RE.test(lines[i + 1] ?? '')
        ? BARE_OPTION_RE.exec(line)
        : null;
    const answer = ANSWER_RE.exec(line);
    const meta = META_RE.exec(line);

    if (statementStart) {
      push();
      seq++;
      lastOption = null;
      current = {
        statement: statementStart.statement.trim(),
        options: [],
        answer: null,
        meta: {},
        images: [],
        sourceSeq: seq,
        ...(statementStart.label ? { sourceLabel: statementStart.label } : {}),
      };
    } else if (!current) {
      // Preamble before the first question marker — ignore.
      continue;
    } else if (option || bareOption) {
      const m = (option ?? bareOption) as RegExpExecArray;
      lastOption = { key: m[1].toUpperCase(), text: option ? m[2].trim() : '' };
      current.options.push(lastOption);
    } else if (answer) {
      lastOption = null;
      current.answer = answer[1].trim();
    } else if (IMAGE_TOKEN_RE.test(line)) {
      const img = imageByToken.get(line);
      if (img) {
        if (lastOption && !lastOption.image) lastOption.image = img;
        else if (!lastOption) current.images.push(img);
      }
    } else if (meta) {
      lastOption = null;
      let key = meta[1].toLowerCase().replace(/\s+/g, '');
      // `Negative: 1` and `Negative Marks: 1` both mean the same thing, but the
      // regex produced two different keys and only one of them was ever read —
      // so the shorter spelling parsed successfully and was then ignored.
      if (key === 'negative') key = 'negativemarks';
      current.meta[key] = meta[2].trim();
    } else {
      // Continuation of the statement.
      lastOption = null;
      current.statement = `${current.statement} ${line}`.trim();
    }
  }
  push();
  return questions;
}
