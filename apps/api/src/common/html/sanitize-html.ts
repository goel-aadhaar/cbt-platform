// Pinned exactly (package.json has no "^") at 2.17.1: 2.17.2+ bumped its
// htmlparser2 dependency to a pure-ESM build ("type": "module", no CJS
// export), which Jest's default CJS transform can't load. Bump this pin only
// alongside a matching Jest ESM-transform fix.
import { normalizeSymbols } from '@drsk/shared';
import sanitizeHtmlLib from 'sanitize-html';

/**
 * Allowlist matching exactly what the Tiptap toolbar
 * (`apps/web/src/components/admin/rich-text-editor.tsx`, StarterKit + Link)
 * can produce — bold/italic/strike, lists, blockquote, links, inline/block
 * code. Anything else (scripts, iframes, style, on* attributes) is stripped,
 * not escaped, since this is the only place free-form HTML enters the app.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'code',
      'pre',
      // Science notation: H<sub>2</sub>SO<sub>4</sub>, x<sup>2</sup>. Neither
      // can carry an attribute or a URL, so allowing them adds no attack
      // surface — and without them a chemistry paper cannot state a formula.
      'sub',
      'sup',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
      // Pasted HTML and spreadsheets use the older spellings; store one form.
      b: 'strong',
      i: 'em',
      strike: 's',
      del: 's',
    },
  });
}

/** Same delimiters the web renderer splits on (`components/rich-text.tsx`). */
const MATH_SPLIT =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Undo entity encoding, however many times it was applied. */
function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(
      /&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d+)|#x([0-9a-f]+));/gi,
      (entity, name?: string, dec?: string, hex?: string) => {
        if (name) return NAMED_ENTITIES[name.toLowerCase()];
        const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      },
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A `<` that does not open a real tag is the author's less-than sign. The
 * parser would otherwise read `a<b and c>d` as a tag and delete the middle of
 * the sentence. Attributes must look like `name=value`, which is what separates
 * that from `<b and c>`. Anything left as text here is only made less dangerous.
 */
const STRAY_ANGLE =
  /<(?!\/?[a-z][a-z0-9-]*(?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))*\s*\/?>|!--)/gi;

/**
 * A formatting tag that arrived as visible text — typed into Word, or escaped
 * by a tool on the way here — is what the author meant as formatting.
 */
const ESCAPED_FORMAT_TAG = /&lt;(\/?)(sub|sup|strong|b|em|i|u)&gt;/gi;

/** Formula source: plain text, stored once-escaped so a later parse cannot eat it. */
function protectMath(expr: string): string {
  const bare = expr
    .replace(/<\/?(?:strong|b|em|i|u|s|sub|sup)>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ');
  return escapeText(decodeEntities(bare));
}

/**
 * Sanitize a question's statement, option or explanation, and put it in the one
 * form every screen renders: inline HTML with no wrapping `<p>`, line breaks as
 * `<br>`, text entity-escaped exactly once. Running it twice changes nothing,
 * which is what keeps formatting stable across save, edit, review and approval.
 *
 * These were stored **raw** and rendered as plain text, so nothing was escaped
 * and nothing was stripped — safe only because the text never reached a HTML
 * parser. Rendering notation means it now does, which makes sanitizing on write
 * a prerequisite rather than a nicety: this is the highest-stakes screen in the
 * product, and a stored script in a question statement would execute inside a
 * live exam.
 *
 * Same allowlist as the rich-text fields. Maths written as `$…$` or `\\(…\\)` is
 * lifted out first and only escaped: it is plain text at this layer, and the
 * browser typesets it after this sanitizer has had its say, never before.
 */
export function sanitizeQuestionText(text: string): string {
  const formulas: string[] = [];
  const prepared = normalizeSymbols(text)
    .replace(/[]/g, '')
    .split(MATH_SPLIT)
    .map((part, i) => {
      if (i % 2 === 0) return part;
      formulas.push(protectMath(part));
      return `${formulas.length - 1}`;
    })
    .join('')
    .replace(STRAY_ANGLE, '&lt;')
    .replace(ESCAPED_FORMAT_TAG, '<$1$2>');

  return sanitizeRichText(prepared)
    .replace(/<\/p>\s*<p>/g, '<br>')
    .replace(/<\/?p>/g, '')
    .replace(/<br\s*\/>/g, '<br>')
    .replace(/\r?\n/g, '<br>')
    .replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '')
    .replace(/(\d+)/g, (_m, n: string) => formulas[Number(n)]);
}

/** Question text with its markup gone, for labels and plain-text outputs. */
export function questionPlainText(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>|<\/(?:p|li|div)>/gi, '\n').replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const PREVIEW_TOKEN =
  /<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|[\s\S]/gi;

/**
 * The start of stored question text, for a short row. A plain `.slice` can stop
 * inside a tag, an entity or a formula, and the broken end then shows on screen;
 * this stops between them and closes whatever was still open.
 */
export function questionTextPreview(html: string, max: number): string {
  const open: string[] = [];
  let out = '';
  let seen = 0;
  for (const [token] of html.matchAll(PREVIEW_TOKEN)) {
    const tag = /^<(\/?)([a-z0-9]+)/i.exec(token);
    if (tag) {
      if (tag[1]) open.pop();
      else if (tag[2].toLowerCase() !== 'br') open.push(tag[2]);
      out += token;
      continue;
    }
    if (seen >= max) {
      const closing = open.reverse().map((t) => `</${t}>`);
      return `${out.trimEnd()}${closing.join('')}...`;
    }
    seen += token.startsWith('&') ? 1 : token.length;
    out += token;
  }
  return out;
}

export interface QuestionTextRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  subScript?: boolean;
  superScript?: boolean;
  /** Starts on a new line. */
  lineBreak?: boolean;
}

const RUN_MARK = {
  strong: 'bold',
  em: 'italics',
  u: 'underline',
  s: 'strike',
  sub: 'subScript',
  sup: 'superScript',
} as const;

/** Split stored question text into styled runs, for formats that are not HTML. */
export function questionTextRuns(html: string): QuestionTextRun[] {
  const runs: QuestionTextRun[] = [];
  const marks: QuestionTextRun = { text: '' };
  let lineBreak = false;
  for (const part of html.split(/(<[^>]*>)/)) {
    const tag = /^<(\/?)([a-z]+)\b[^>]*>$/i.exec(part);
    if (!tag) {
      const text = decodeEntities(part);
      if (!text) continue;
      runs.push({ ...marks, text, ...(lineBreak ? { lineBreak } : {}) });
      lineBreak = false;
    } else if (tag[2].toLowerCase() === 'br') {
      lineBreak = true;
    } else {
      const mark = RUN_MARK[tag[2].toLowerCase() as keyof typeof RUN_MARK];
      if (!mark) continue;
      if (tag[1]) delete marks[mark];
      else marks[mark] = true;
    }
  }
  return runs;
}
