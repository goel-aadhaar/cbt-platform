import { createRequire } from 'module';

import { MATH_PATTERN, symbolFontChar } from '@drsk/shared';

import { ommlToLatex } from './omml-to-latex';

/**
 * Word equations (OMML) survive import as LaTeX or as visible placeholders.
 *
 * mammoth silently drops every `<m:oMath>` element, so an imported question
 * that said "Solve x² + 3x = 0" arrived reading "Solve" — a question that looks
 * complete and is not. Before mammoth runs, each equation is replaced in
 * `word/document.xml` by an ordinary text run, which keeps its position in the
 * sentence. An equation `ommlToLatex` understands becomes a formula; any other
 * reads `[[EQ: <linear text>]]`, a readable approximation that the admin retypes
 * as LaTeX (`$x^2 + 3x = 0$`) in the review screen. A question still carrying a
 * placeholder cannot be submitted or approved (see `assertNoFormulaPlaceholder`).
 *
 * The placeholder stays for everything else because a wrong silent conversion
 * is worse than a visible gap.
 */

/** Matches a leftover equation placeholder in any question text. */
export const FORMULA_PLACEHOLDER_RE = /\[\[EQ\b/;

/**
 * A converted equation on its way through mammoth and the line parser, kept
 * apart from text until {@link settleFormulas} can see the whole field. Sits
 * after the private-use range `docx-import.ts` uses for formatting marks.
 */
const FORMULA_OPEN = '';
const FORMULA_CLOSE = '';
const FORMULA_RE = /([^]*)/g;

export function hasFormulaPlaceholder(...texts: unknown[]): boolean {
  return texts.some(
    (t) => typeof t === 'string' && FORMULA_PLACEHOLDER_RE.test(t),
  );
}

interface JsZipFile {
  async(type: 'string'): Promise<string>;
}
interface JsZipInstance {
  file(name: string): JsZipFile | null;
  file(name: string, data: string): JsZipInstance;
  generateAsync(options: { type: 'nodebuffer' }): Promise<Buffer>;
}
export interface JsZipStatic {
  new (): JsZipInstance;
  loadAsync(data: Buffer): Promise<JsZipInstance>;
}

/**
 * jszip is installed (mammoth and exceljs depend on it) but is not a direct
 * dependency of this app, so under pnpm's strict layout it only resolves from
 * mammoth's own location. Prefer a direct install if one is ever added.
 */
export function loadJsZip(): JsZipStatic {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('jszip') as JsZipStatic;
  } catch {
    return createRequire(require.resolve('mammoth'))('jszip') as JsZipStatic;
  }
}

const TOKEN_RE =
  /<m:t(?:\s[^>]*)?>([\s\S]*?)<\/m:t>|<m:(?:chr|begChr|endChr|sepChr)\s[^>]*?m:val="([^"]*)"[^>]*\/?>|<(\/?)m:(num|den|sup|sub|rad)(?:\s[^>]*)?>/g;

/** A readable one-line approximation of an equation's content. */
export function linearizeOmml(omml: string): string {
  let out = '';
  for (const m of omml.matchAll(TOKEN_RE)) {
    if (m[1] !== undefined) {
      out += m[1];
    } else if (m[2] !== undefined) {
      out += m[2];
    } else {
      const closing = m[3] === '/';
      switch (m[4]) {
        case 'num':
          out += closing ? ')' : '(';
          break;
        case 'den':
          out += closing ? ')' : '/(';
          break;
        case 'sup':
          out += closing ? ')' : '^(';
          break;
        case 'sub':
          out += closing ? ')' : '_(';
          break;
        default:
          out += closing ? ')' : '√(';
      }
    }
  }
  return out.trim();
}

function placeholder(text: string): string {
  return `[[EQ: ${text.replace(/\]\]/g, '] ]')}]]`;
}

function equationRun(omml: string): string {
  const latex = ommlToLatex(omml);
  const text =
    latex === null
      ? placeholder(linearizeOmml(omml))
      : `${FORMULA_OPEN}${latex.replace(/&/g, '&amp;')}${FORMULA_CLOSE}`;
  return `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

const MATH_RE = new RegExp(MATH_PATTERN, 'g');

/**
 * Give each converted equation in one finished field its final form. A dollar
 * sign elsewhere in the field can pair with the formula's own and turn the text
 * between them into maths: "Find $y" before an equation `x` reads as `$y$`
 * followed by a stray `x$`. Prices are safe ("Rs $5 and $x^2$" is fine), so the
 * check is exact: every formula must read back as maths on its own, by the
 * renderer's own pattern. Otherwise they all go back to being placeholders, with
 * their LaTeX ready to reuse.
 */
export function settleFormulas(text: string): string {
  const spans = new Set<string>();
  let out = '';
  let last = 0;
  for (const m of text.matchAll(FORMULA_RE)) {
    out += text.slice(last, m.index);
    const formula = `$${m[1]}$`;
    spans.add(`${out.length}:${out.length + formula.length}`);
    out += formula;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  const intact = [...out.matchAll(MATH_RE)].filter((m) =>
    spans.has(`${m.index}:${m.index + m[0].length}`),
  ).length;
  return intact === spans.size
    ? out
    : text.replace(FORMULA_RE, (_m, latex: string) => placeholder(latex));
}

const OMATH_RE = /<m:oMath(?:\s[^>]*)?>[\s\S]*?<\/m:oMath>/g;
const OMATH_EMPTY_RE = /<m:oMath\s*\/>/g;
const OMATH_PARA_RE = /<m:oMathPara(?:\s[^>]*)?>([\s\S]*?)<\/m:oMathPara>/g;

/** Replace every equation in a `document.xml` string; pure, for testing. */
export function replaceEquations(xml: string): { xml: string; count: number } {
  let count = 0;
  const swap = (omml: string) => {
    count++;
    return equationRun(omml);
  };
  const out = xml
    .replace(OMATH_PARA_RE, (_all, inner: string) => {
      const parts = inner.match(OMATH_RE) ?? [];
      return parts.length > 0 ? parts.map(swap).join('') : swap(inner);
    })
    .replace(OMATH_RE, (omml) => swap(omml))
    .replace(OMATH_EMPTY_RE, () => swap(''));
  return { xml: out, count };
}

const RUN_RE = /<w:r(?:\s[^>]*?[^/>])?>[\s\S]*?<\/w:r>/g;
const RUN_PROPS_RE = /<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/;
const SYMBOL_FONT_RE = /<w:rFonts\b[^>]*\bw:(?:ascii|hAnsi)=["']Symbol["']/;
const RUN_TEXT_RE = /(<w:t(?:\s[^>]*?[^/>])?>)([\s\S]*?)(<\/w:t>)/g;
/** One XML entity, or one character. Entities are the same in both fonts. */
const XML_CHAR_RE = /&#?\w+;|[\s\S]/g;

/** Rewrite the characters of a Symbol-font run as what they actually show. */
function symbolText(text: string): string {
  return text.replace(XML_CHAR_RE, (ch) => {
    if (ch.length > 1 || ch.charCodeAt(0) > 0xff) return ch;
    return symbolFontChar(ch.charCodeAt(0)) ?? ch;
  });
}

/**
 * Text typed in Word's Symbol font is stored as ordinary letters, and mammoth
 * passes the letter on without the font: a paper reading "α = 2" imported as
 * "a = 2", which is a different question and looks perfectly fine. Pure, for
 * testing.
 */
export function replaceSymbolRuns(xml: string): { xml: string; count: number } {
  if (!xml.includes('Symbol')) return { xml, count: 0 };
  let count = 0;
  const out = xml.replace(RUN_RE, (run) => {
    const props = RUN_PROPS_RE.exec(run)?.[0];
    if (!props || !SYMBOL_FONT_RE.test(props)) return run;
    const next = run.replace(
      RUN_TEXT_RE,
      (_m, open: string, text: string, close: string) =>
        `${open}${symbolText(text)}${close}`,
    );
    if (next !== run) count++;
    return next;
  });
  return { xml: out, count };
}

/**
 * Return the .docx with each equation swapped for a formula or placeholder run
 * and its Symbol-font text made real. A document with neither is returned
 * untouched (same buffer).
 */
export async function injectEquationPlaceholders(
  buffer: Buffer,
): Promise<{ buffer: Buffer; equations: number }> {
  const JSZip = loadJsZip();
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) return { buffer, equations: 0 };
  const symbols = replaceSymbolRuns(await entry.async('string'));
  const { xml: next, count } = symbols.xml.includes('<m:oMath')
    ? replaceEquations(symbols.xml)
    : { xml: symbols.xml, count: 0 };
  if (count === 0 && symbols.count === 0) return { buffer, equations: 0 };
  zip.file('word/document.xml', next);
  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    equations: count,
  };
}
