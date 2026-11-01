import mammoth from 'mammoth';

import { injectEquationPlaceholders, settleFormulas } from './docx-equations';
import { ParsedImage, ParsedQuestion } from './ports/question-import.port';

const OPTION_RE = /^\(?([A-Ha-h])[).\]]\s+(.+)$/;
// An option made only of an image: Word gives "A)" and then the image on the
// next line. Honoured only when that next line really is an image token.
const BARE_OPTION_RE = /^\(?([A-Ha-h])[).\]]$/;
const ANSWER_RE = /^(?:answer|ans|correct answer|correct)\s*[:.-]?\s*(.+)$/i;
const META_RE =
  /^(subject|chapter|topic|difficulty|type|marks|negative(?:\s*marks)?|tags|explanation|language|exam\s*type)\s*[:.-]?\s*(.+)$/i;
const EXPLANATION_RE = /^explanation\b/i;
// "Explanation:" on a line of its own, with the text on the lines after it.
const EXPLANATION_HEADING_RE = /^explanation\s*[:.-]?$/i;
// A new question starts with "Q:", "Q1.", "Question 5.", "1.", "1)" etc.
// The marker number is captured (it becomes the question's source label).
const Q_MARKER_RE = /^Q(?:uestion)?\s*(\d+)?\s*[:.)]\s*(.*)$/i;
// A bare number needs whitespace AND text after the punctuation, so "2.5 m/s is
// the speed" and a lone "3)" on its own line stay part of the statement instead
// of starting a new question.
const NUM_MARKER_RE = /^(\d+)\s*[:.)]\s+(\S.*)$/;

/** A token standing in for an image, in the text where the image appeared. */
const IMAGE_TOKEN_RE = /^\[\[IMAGE:(\d+)\]\]$/;

/**
 * Inline formatting, carried through the line parser as one private-use
 * character per tag: open at an even offset from the first code point, close at
 * the odd one after it. A tag at the start of a line would stop every marker
 * regex matching ("<strong>Q1.</strong> Which…" is not a question start), so the
 * regexes run on {@link plainOf} and the formatted text is recovered afterwards.
 */
const MARK_TAGS = ['strong', 'em', 'u', 's', 'sub', 'sup'];
const FIRST_MARK = 0xe010;
const MARK_RE = /[\uE010-\uE01B]/g;

function isMark(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= FIRST_MARK && code < FIRST_MARK + MARK_TAGS.length * 2;
}

function isOpening(mark: string): boolean {
  return (mark.charCodeAt(0) - FIRST_MARK) % 2 === 0;
}

function closingOf(mark: string): string {
  return String.fromCharCode(mark.charCodeAt(0) + 1);
}

/** The marks still open after `line`, given the ones open before it. */
function openMarks(line: string, before: string[] = []): string[] {
  const open = [...before];
  for (const ch of line) {
    if (!isMark(ch)) continue;
    if (isOpening(ch)) {
      open.push(ch);
    } else {
      const at = open.lastIndexOf(String.fromCharCode(ch.charCodeAt(0) - 1));
      if (at >= 0) open.splice(at, 1);
    }
  }
  return open;
}

function plainOf(line: string): string {
  return line.replace(MARK_RE, '');
}

/**
 * The formatted text of a match that ran to the end of `line`, given what it
 * captured from the plain version. Marks opened in the part cut off are opened
 * again, so `<strong>Q1. What is</strong> this` keeps "What is" bold.
 */
function tailOf(line: string, captured: string): string {
  if (!captured) return '';
  const from = plainOf(line).trimEnd().length - captured.length;
  let seen = 0;
  for (let i = 0; i < line.length; i++) {
    if (isMark(line[i])) continue;
    if (seen === from) {
      return openMarks(line.slice(0, i)).join('') + line.slice(i);
    }
    seen++;
  }
  return '';
}

/** Turn the marks back into tags, once a block's text is final. */
function marksToHtml(text: string): string {
  return text.replace(MARK_RE, (mark) => {
    const offset = mark.charCodeAt(0) - FIRST_MARK;
    const tag = MARK_TAGS[Math.floor(offset / 2)];
    return isOpening(mark) ? `<${tag}>` : `</${tag}>`;
  });
}

/**
 * A run of bold can span a Word line break, which here is two lines that may
 * end up in different fields. Close what is open at the end of each line and
 * reopen it on the next, so every line stands on its own.
 */
function balanceMarks(lines: string[]): string[] {
  let open: string[] = [];
  return lines.map((line) => {
    const reopened = open.join('');
    open = openMarks(line, open);
    const closed = [...open].reverse().map(closingOf).join('');
    return `${reopened}${line}${closed}`;
  });
}

export interface DocxContent {
  text: string;
  images: ParsedImage[];
  /** Word equations replaced by a formula or a `[[EQ: …]]` placeholder. */
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

/** The option line starting at `i`: `A) text`, or a bare `A)` before an image. */
function matchOption(lines: string[], i: number): RegExpExecArray | null {
  const plain = plainOf(lines[i]).trim();
  return (
    OPTION_RE.exec(plain) ??
    (IMAGE_TOKEN_RE.test(plainOf(lines[i + 1] ?? '').trim())
      ? BARE_OPTION_RE.exec(plain)
      : null)
  );
}

/**
 * Lettered lines that belong to the statement. A match-the-following question
 * lists (a), (b)… in its stem and letters its real options from A again, so only
 * the last run from A in a question is options. A list after the answer or the
 * explanation has no say in that.
 */
function stemListLines(lines: string[]): Set<number> {
  const stem = new Set<number>();
  let lettered: number[] = [];
  let closed = false;
  for (const i of lines.keys()) {
    const plain = plainOf(lines[i]).trim();
    if (matchStatementStart(plain)) {
      lettered = [];
      closed = false;
    } else if (ANSWER_RE.test(plain) || EXPLANATION_RE.test(plain)) {
      closed = true;
    } else if (!closed) {
      const letter = matchOption(lines, i)?.[1].toUpperCase();
      if (letter === 'A') {
        lettered.forEach((line) => stem.add(line));
        lettered = [i];
      } else if (letter && lettered.length > 0) {
        lettered.push(i);
      }
    }
  }
  return stem;
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
      // Underline has no HTML meaning of its own, so mammoth drops it unless
      // told otherwise. Bold, italic, strike, sub and sup it keeps by default.
      styleMap: ['u => u'],
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
    .some((l) => matchStatementStart(plainOf(l).trim()) !== null);
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
      const peek = plainOf(
        flatten(html.slice(offset + match.length, offset + 400)),
      )
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
    .replace(MARK_RE, '')
    .replace(/<img[^>]*alt="(\[\[IMAGE:\d+\]\])"[^>]*\/?>/g, '\n$1\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(
      /<(\/?)(strong|em|u|s|sub|sup)>/g,
      (_m, close: string, tag: string) =>
        String.fromCharCode(
          FIRST_MARK + MARK_TAGS.indexOf(tag) * 2 + (close ? 1 : 0),
        ),
    )
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
  return balanceMarks(
    flatten(numberOrderedLists(html))
      .split(/\n/)
      .map((l) => l.trim()),
  ).join('\n');
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
 * sets per-question metadata. Lines that match nothing extend the statement, or
 * the explanation once one has started, and keep their line break: a Word
 * paragraph is already one line however it wraps, so a new line here was meant.
 *
 * Statement, option and explanation text keep their Word formatting as tags;
 * everything else is plain. `sanitizeQuestionText` has the last word on all of it,
 * and turns each `\n` into `<br>`. A `\n` rather than a `<br>` here, because a
 * dollar sign cannot pair with another across it on the way through.
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
      plainOf(current.statement).trim() ||
      current.options.length > 0 ||
      current.images.length > 0;
    if (!hasContent) return;
    current.statement = settleFormulas(marksToHtml(current.statement));
    for (const option of current.options) {
      option.text = settleFormulas(marksToHtml(option.text));
    }
    if (current.meta.explanation) {
      current.meta.explanation = marksToHtml(current.meta.explanation);
    }
    for (const key of Object.keys(current.meta)) {
      current.meta[key] = settleFormulas(current.meta[key]);
    }
    if (current.answer) current.answer = settleFormulas(current.answer);
    questions.push(current);
  };

  // The option an image token would belong to: set by an option line, cleared
  // by anything else, so only an image sitting right after an option attaches
  // to it and an image anywhere else stays with the question.
  let lastOption: ParsedQuestion['options'][number] | null = null;
  // Set by an explanation line: what follows is more of it, not the statement,
  // which students read before they answer.
  let inExplanation = false;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => plainOf(l).trim());
  const stemLines = stemListLines(lines);

  for (const [i, line] of lines.entries()) {
    const plain = plainOf(line).trim();
    const statementStart = matchStatementStart(plain);
    // A list or a "Correct option is B" inside a finished question's explanation
    // is part of the explanation.
    const option =
      stemLines.has(i) || (inExplanation && current?.options.length)
        ? null
        : matchOption(lines, i);
    const answer =
      inExplanation && current?.answer ? null : ANSWER_RE.exec(plain);
    const meta = META_RE.exec(plain);

    if (statementStart) {
      push();
      seq++;
      lastOption = null;
      inExplanation = false;
      current = {
        statement: tailOf(line, statementStart.statement).trim(),
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
    } else if (option) {
      inExplanation = false;
      lastOption = {
        key: option[1].toUpperCase(),
        text: option[2] ? tailOf(line, option[2]).trim() : '',
      };
      current.options.push(lastOption);
    } else if (answer) {
      lastOption = null;
      inExplanation = false;
      current.answer = answer[1].trim();
    } else if (IMAGE_TOKEN_RE.test(plain)) {
      const img = imageByToken.get(plain);
      if (img) {
        if (lastOption && !lastOption.image) lastOption.image = img;
        else if (!lastOption) current.images.push(img);
      }
    } else if (EXPLANATION_HEADING_RE.test(plain)) {
      lastOption = null;
      inExplanation = true;
    } else if (meta) {
      lastOption = null;
      let key = meta[1].toLowerCase().replace(/\s+/g, '');
      // `Negative: 1` and `Negative Marks: 1` both mean the same thing, but the
      // regex produced two different keys and only one of them was ever read —
      // so the shorter spelling parsed successfully and was then ignored.
      if (key === 'negative') key = 'negativemarks';
      inExplanation = key === 'explanation';
      current.meta[key] = inExplanation
        ? tailOf(line, meta[2]).trim()
        : meta[2].trim();
    } else if (inExplanation) {
      current.meta.explanation = current.meta.explanation
        ? `${current.meta.explanation}\n${line}`
        : line;
    } else {
      // Continuation of the statement.
      lastOption = null;
      current.statement = `${current.statement}\n${line}`.trim();
    }
  }
  push();
  return questions;
}
