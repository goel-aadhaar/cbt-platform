import { createRequire } from 'module';

/**
 * Word equations (OMML) survive import as visible placeholders.
 *
 * mammoth silently drops every `<m:oMath>` element, so an imported question
 * that said "Solve x² + 3x = 0" arrived reading "Solve" — a question that looks
 * complete and is not. Before mammoth runs, each equation is replaced in
 * `word/document.xml` by an ordinary text run reading `[[EQ: <linear text>]]`,
 * which keeps both its position in the sentence and a readable approximation of
 * its content. The admin then retypes it as LaTeX (`$x^2 + 3x = 0$`) in the
 * review screen; a question still carrying a placeholder cannot be submitted or
 * approved (see `assertNoFormulaPlaceholder`).
 *
 * Equations are flagged and fixed by a person, never auto-converted: a wrong
 * silent conversion is worse than a visible gap.
 */

/** Matches a leftover equation placeholder in any question text. */
export const FORMULA_PLACEHOLDER_RE = /\[\[EQ\b/;

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

function placeholderRun(omml: string): string {
  const text = linearizeOmml(omml).replace(/\]\]/g, '] ]');
  return `<w:r><w:t xml:space="preserve">[[EQ: ${text}]]</w:t></w:r>`;
}

const OMATH_RE = /<m:oMath(?:\s[^>]*)?>[\s\S]*?<\/m:oMath>/g;
const OMATH_EMPTY_RE = /<m:oMath\s*\/>/g;
const OMATH_PARA_RE = /<m:oMathPara(?:\s[^>]*)?>([\s\S]*?)<\/m:oMathPara>/g;

/** Replace every equation in a `document.xml` string; pure, for testing. */
export function replaceEquations(xml: string): { xml: string; count: number } {
  let count = 0;
  const swap = (omml: string) => {
    count++;
    return placeholderRun(omml);
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

/**
 * Return the .docx with each equation swapped for a placeholder run. A
 * document with no equations is returned untouched (same buffer).
 */
export async function injectEquationPlaceholders(
  buffer: Buffer,
): Promise<{ buffer: Buffer; equations: number }> {
  const JSZip = loadJsZip();
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) return { buffer, equations: 0 };
  const xml = await entry.async('string');
  if (!xml.includes('<m:oMath')) return { buffer, equations: 0 };
  const { xml: next, count } = replaceEquations(xml);
  if (count === 0) return { buffer, equations: 0 };
  zip.file('word/document.xml', next);
  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    equations: count,
  };
}
