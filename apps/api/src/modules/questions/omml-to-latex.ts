/**
 * Word equations (OMML) as LaTeX, for the notation question papers actually use.
 *
 * Conversion is all or nothing. A wrong formula that looks right is worse than
 * one a reviewer is told to retype, so any element, property value or character
 * this file does not know makes the whole equation `null`, and the caller keeps
 * its `[[EQ: …]]` flag.
 *
 * Output is plain ASCII with no `$` and no angle brackets (`\lt`, `\gt`). The
 * sanitizer strips format tags inside a formula, so `a<b>c` written literally
 * would lose its `<b>`.
 */

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  kids: (XmlNode | string)[];
}

function unsupported(): never {
  throw new Error('unsupported OMML');
}

const XML_RE =
  /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|[^<]+/g;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function xmlText(raw: string): string {
  return raw.replace(
    /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-f]+));/gi,
    (_m, name?: string, dec?: string, hex?: string) =>
      name
        ? XML_ENTITIES[name.toLowerCase()]
        : String.fromCodePoint(dec ? Number(dec) : parseInt(hex ?? '', 16)),
  );
}

/** Just enough XML for one equation; anything malformed throws. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, kids: [] };
  const stack = [root];
  let at = 0;
  for (const m of xml.matchAll(XML_RE)) {
    if (m.index !== at) unsupported();
    at += m[0].length;
    const top = stack[stack.length - 1];
    if (!m[2]) {
      if (!m[0].startsWith('<')) top.kids.push(xmlText(m[0]));
    } else if (m[1]) {
      if (stack.pop()?.name !== m[2]) unsupported();
    } else {
      const attrs: Record<string, string> = {};
      for (const a of m[3].matchAll(ATTR_RE)) {
        attrs[a[1]] = xmlText(a[2] ?? a[3]);
      }
      const node: XmlNode = { name: m[2], attrs, kids: [] };
      top.kids.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  if (at !== xml.length || stack.length !== 1) unsupported();
  return root;
}

function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.kids.find(
    (kid): kid is XmlNode => typeof kid !== 'string' && kid.name === name,
  );
}

function val(node: XmlNode | undefined, name: string): string | undefined {
  return child(node, name)?.attrs['m:val'];
}

/** An on/off property: present means on, unless its value says otherwise. */
function isOn(node: XmlNode | undefined, name: string): boolean {
  const el = child(node, name);
  return !!el && !['0', 'off', 'false'].includes(el.attrs['m:val']);
}

function lookup(table: Record<string, string>, key: string): string {
  return Object.hasOwn(table, key) ? table[key] : unsupported();
}

const NAMED_SPACE = ' ';
const INVISIBLE = '';

/** Characters needing more than themselves. Anything unlisted must match SAFE_CHAR_RE. */
const SYMBOLS: Record<string, string> = {
  // Spaces, and the invisible operators Word puts between terms.
  '\t': NAMED_SPACE,
  '\n': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  ' ': NAMED_SPACE,
  '​': INVISIBLE,
  '‌': INVISIBLE,
  '‍': INVISIBLE,
  '⁠': INVISIBLE,
  '⁡': INVISIBLE,
  '⁢': INVISIBLE,
  '⁣': INVISIBLE,
  '⁤': INVISIBLE,
  '﻿': INVISIBLE,
  // ASCII that means something to LaTeX or to the sanitizer.
  '<': '\\lt',
  '>': '\\gt',
  '%': '\\%',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\sim',
  // Greek. The Latin-looking capitals have no command of their own.
  α: '\\alpha',
  β: '\\beta',
  γ: '\\gamma',
  δ: '\\delta',
  ε: '\\varepsilon',
  ϵ: '\\epsilon',
  ζ: '\\zeta',
  η: '\\eta',
  θ: '\\theta',
  ϑ: '\\vartheta',
  ι: '\\iota',
  κ: '\\kappa',
  λ: '\\lambda',
  μ: '\\mu',
  µ: '\\mu',
  ν: '\\nu',
  ξ: '\\xi',
  ο: 'o',
  π: '\\pi',
  ϖ: '\\varpi',
  ρ: '\\rho',
  ϱ: '\\varrho',
  σ: '\\sigma',
  ς: '\\varsigma',
  τ: '\\tau',
  υ: '\\upsilon',
  φ: '\\varphi',
  ϕ: '\\phi',
  χ: '\\chi',
  ψ: '\\psi',
  ω: '\\omega',
  Α: 'A',
  Β: 'B',
  Γ: '\\Gamma',
  Δ: '\\Delta',
  '∆': '\\Delta',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'H',
  Θ: '\\Theta',
  Ι: 'I',
  Κ: 'K',
  Λ: '\\Lambda',
  Μ: 'M',
  Ν: 'N',
  Ξ: '\\Xi',
  Ο: 'O',
  Π: '\\Pi',
  Ρ: 'P',
  Σ: '\\Sigma',
  Τ: 'T',
  Υ: '\\Upsilon',
  Φ: '\\Phi',
  Χ: 'X',
  Ψ: '\\Psi',
  Ω: '\\Omega',
  Ω: '\\Omega',
  // Arithmetic and relations.
  '−': '-',
  '–': '-',
  '×': '\\times',
  '÷': '\\div',
  '±': '\\pm',
  '∓': '\\mp',
  '·': '\\cdot',
  '⋅': '\\cdot',
  '∙': '\\cdot',
  '∗': '\\ast',
  '∘': '\\circ',
  '°': '\\degree',
  '∕': '/',
  '⁄': '/',
  '∶': ':',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '≈': '\\approx',
  '≡': '\\equiv',
  '∼': '\\sim',
  '≃': '\\simeq',
  '≅': '\\cong',
  '∝': '\\propto',
  '≪': '\\ll',
  '≫': '\\gg',
  // Arrows.
  '→': '\\rightarrow',
  '←': '\\leftarrow',
  '↔': '\\leftrightarrow',
  '⟶': '\\longrightarrow',
  '⇒': '\\Rightarrow',
  '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow',
  '↑': '\\uparrow',
  '↓': '\\downarrow',
  '⇌': '\\rightleftharpoons',
  // Sets, logic, geometry, calculus.
  '∞': '\\infty',
  '∂': '\\partial',
  '∇': '\\nabla',
  '∈': '\\in',
  '∉': '\\notin',
  '∋': '\\ni',
  '⊂': '\\subset',
  '⊃': '\\supset',
  '⊆': '\\subseteq',
  '⊇': '\\supseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∅': '\\emptyset',
  '∀': '\\forall',
  '∃': '\\exists',
  '∧': '\\wedge',
  '∨': '\\vee',
  '¬': '\\neg',
  '∠': '\\angle',
  '⊥': '\\perp',
  '∥': '\\parallel',
  '∴': '\\therefore',
  '∵': '\\because',
  '…': '\\ldots',
  '⋯': '\\cdots',
  '∑': '\\sum',
  '∏': '\\prod',
  '∫': '\\int',
  '′': "'",
  '″': "''",
  '‴': "'''",
  ℏ: '\\hbar',
  ℓ: '\\ell',
  Å: '\\mathring{A}',
};

const SAFE_CHAR_RE = /^[0-9 +\-=/()[\],.;:!?'|*@]$/;

const DELIMITERS: Record<string, string> = {
  '': '.',
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '{': '\\{',
  '}': '\\}',
  '|': '|',
  '‖': '\\|',
  '<': '\\langle',
  '>': '\\rangle',
  '⟨': '\\langle',
  '⟩': '\\rangle',
  '〈': '\\langle',
  '〉': '\\rangle',
  '⌊': '\\lfloor',
  '⌋': '\\rfloor',
  '⌈': '\\lceil',
  '⌉': '\\rceil',
};

const NARY: Record<string, string> = {
  '∑': '\\sum',
  '∏': '\\prod',
  '∐': '\\coprod',
  '∫': '\\int',
  '∬': '\\iint',
  '∭': '\\iiint',
  '∮': '\\oint',
  '⋃': '\\bigcup',
  '⋂': '\\bigcap',
  '⋁': '\\bigvee',
  '⋀': '\\bigwedge',
};

/** Word stores an accent as its combining character, sometimes the spacing one. */
const ACCENTS: Record<string, string> = {
  '̀': '\\grave',
  '́': '\\acute',
  '̂': '\\hat',
  '^': '\\hat',
  '̃': '\\tilde',
  '~': '\\tilde',
  '̄': '\\bar',
  '̅': '\\overline',
  '̆': '\\breve',
  '̇': '\\dot',
  '̈': '\\ddot',
  '̌': '\\check',
  '⃗': '\\vec',
  '→': '\\vec',
};

const RUN_STYLES: Record<string, string> = {
  p: 'mathrm',
  b: 'mathbf',
  bi: 'boldsymbol',
};

/** Upright names with a LaTeX command of their own. */
const FUNCTIONS = new Set(
  'sin cos tan cot sec csc sinh cosh tanh coth arcsin arccos arctan log ln lg exp lim min max det gcd deg dim ker arg sup inf'.split(
    ' ',
  ),
);

/** Fonts where a stored letter is not the character shown. */
const PICTURE_FONT_RE = /^(?:Symbol|Wingdings|Webdings)/i;

/** What each structure may hold, so a stray child cannot be skipped silently. */
const PARTS: Record<string, string[]> = {
  'm:f': ['m:fPr', 'm:num', 'm:den'],
  'm:sSup': ['m:sSupPr', 'm:e', 'm:sup'],
  'm:sSub': ['m:sSubPr', 'm:e', 'm:sub'],
  'm:sSubSup': ['m:sSubSupPr', 'm:e', 'm:sub', 'm:sup'],
  'm:rad': ['m:radPr', 'm:deg', 'm:e'],
  'm:d': ['m:dPr', 'm:e'],
  'm:nary': ['m:naryPr', 'm:sub', 'm:sup', 'm:e'],
  'm:bar': ['m:barPr', 'm:e'],
  'm:acc': ['m:accPr', 'm:e'],
  'm:func': ['m:funcPr', 'm:fName', 'm:e'],
};

/** Inside an equation but nothing to do with what it says. */
const IGNORED = new Set([
  'm:ctrlPr',
  'm:argPr',
  'w:bookmarkStart',
  'w:bookmarkEnd',
  'w:proofErr',
  'w:permStart',
  'w:permEnd',
]);

/** Join two pieces, keeping a command from swallowing the letter after it. */
function glue(a: string, b: string): string {
  return /\\[A-Za-z]+$/.test(a) && /^[A-Za-z]/.test(b) ? `${a} ${b}` : a + b;
}

/** Wrapped unless already one token, so a script applies to all of it. */
function atom(latex: string): string {
  return /^(?:[A-Za-z0-9]|\\[A-Za-z]+)$/.test(latex) ? latex : `{${latex}}`;
}

function symbol(ch: string): string {
  return Object.hasOwn(SYMBOLS, ch)
    ? SYMBOLS[ch]
    : SAFE_CHAR_RE.test(ch)
      ? ch
      : unsupported();
}

function run(node: XmlNode): string {
  let text = '';
  for (const kid of node.kids) {
    if (typeof kid === 'string') {
      if (kid.trim()) unsupported();
    } else if (kid.name === 'm:t') {
      for (const part of kid.kids) {
        if (typeof part !== 'string') unsupported();
        text += part;
      }
    } else if (kid.name !== 'm:rPr' && kid.name !== 'w:rPr') {
      unsupported();
    }
  }

  const fonts = child(child(node, 'w:rPr'), 'w:rFonts');
  if (Object.values(fonts?.attrs ?? {}).some((f) => PICTURE_FONT_RE.test(f))) {
    unsupported();
  }

  const props = child(node, 'm:rPr');
  if (isOn(props, 'm:nor')) {
    if (!/^[A-Za-z0-9 .,:;/()+=-]*$/.test(text)) unsupported();
    return text.trim() ? `\\text{${text}}` : text;
  }
  const script = val(props, 'm:scr');
  if (script && script !== 'roman') unsupported();
  const sty = val(props, 'm:sty') ?? 'i';
  const style = sty === 'i' ? null : lookup(RUN_STYLES, sty);

  let out = '';
  for (const [piece] of text.matchAll(/[A-Za-z]+|[\s\S]/gu)) {
    if (!/^[A-Za-z]/.test(piece)) {
      out = glue(out, symbol(piece));
    } else if (style === 'mathrm' && FUNCTIONS.has(piece)) {
      out = glue(out, `\\${piece}`);
    } else {
      out = glue(out, style ? `\\${style}{${piece}}` : piece);
    }
  }
  return out;
}

function row(node: XmlNode): string {
  let out = '';
  for (const kid of node.kids) {
    if (typeof kid !== 'string') out = glue(out, convert(kid));
    else if (kid.trim()) unsupported();
  }
  return out.trim();
}

function part(node: XmlNode, name: string): string {
  const el = child(node, name);
  return el ? row(el) : unsupported();
}

function optionalPart(node: XmlNode, name: string): string {
  const el = child(node, name);
  return el ? row(el) : '';
}

function delimited(node: XmlNode): string {
  const props = child(node, 'm:dPr');
  const open = lookup(DELIMITERS, val(props, 'm:begChr') ?? '(');
  const close = lookup(DELIMITERS, val(props, 'm:endChr') ?? ')');
  const sepChr = val(props, 'm:sepChr') ?? '|';
  const separator = sepChr ? symbol(sepChr) : '';
  let body = '';
  node.kids
    .filter((kid): kid is XmlNode => typeof kid !== 'string')
    .filter((kid) => kid.name === 'm:e')
    .forEach((kid, i) => {
      body = glue(i > 0 ? glue(body, separator) : body, row(kid));
    });
  return `${glue(`\\left${open}`, body)}\\right${close}`;
}

function nary(node: XmlNode): string {
  const props = child(node, 'm:naryPr');
  // Word leaves the character out for a plain integral.
  const operator = lookup(NARY, val(props, 'm:chr') ?? '∫');
  const lower = isOn(props, 'm:subHide') ? '' : optionalPart(node, 'm:sub');
  const upper = isOn(props, 'm:supHide') ? '' : optionalPart(node, 'm:sup');
  const limits = `${lower && `_{${lower}}`}${upper && `^{${upper}}`}`;
  return `${operator}${limits} ${part(node, 'm:e')}`;
}

function convert(node: XmlNode): string {
  const parts = Object.hasOwn(PARTS, node.name) ? PARTS[node.name] : null;
  for (const kid of parts ? node.kids : []) {
    if (typeof kid === 'string' ? kid.trim() : !parts?.includes(kid.name)) {
      unsupported();
    }
  }

  switch (node.name) {
    case 'm:oMath':
      return row(node);
    case 'm:r':
      return run(node);
    case 'm:f': {
      const type = val(child(node, 'm:fPr'), 'm:type') ?? 'bar';
      if (!['bar', 'skw', 'lin'].includes(type)) unsupported();
      return `\\frac{${part(node, 'm:num')}}{${part(node, 'm:den')}}`;
    }
    case 'm:sSup':
      return `${atom(part(node, 'm:e'))}^{${part(node, 'm:sup')}}`;
    case 'm:sSub':
      return `${atom(part(node, 'm:e'))}_{${part(node, 'm:sub')}}`;
    case 'm:sSubSup':
      return `${atom(part(node, 'm:e'))}_{${part(node, 'm:sub')}}^{${part(node, 'm:sup')}}`;
    case 'm:rad': {
      const hidden = isOn(child(node, 'm:radPr'), 'm:degHide');
      const degree = hidden ? '' : optionalPart(node, 'm:deg');
      const body = part(node, 'm:e');
      if (!degree) return `\\sqrt{${body}}`;
      return `\\sqrt[${degree.includes(']') ? `{${degree}}` : degree}]{${body}}`;
    }
    case 'm:d':
      return delimited(node);
    case 'm:nary':
      return nary(node);
    case 'm:bar': {
      // Word always writes this; left out, the sources disagree, so ask a person.
      const pos = val(child(node, 'm:barPr'), 'm:pos');
      if (pos !== 'top' && pos !== 'bot') unsupported();
      const bar = pos === 'top' ? 'overline' : 'underline';
      return `\\${bar}{${part(node, 'm:e')}}`;
    }
    case 'm:acc': {
      const chr = val(child(node, 'm:accPr'), 'm:chr') ?? '̂';
      return `${lookup(ACCENTS, chr)}{${part(node, 'm:e')}}`;
    }
    case 'm:func':
      return `${part(node, 'm:fName')} ${part(node, 'm:e')}`.trimEnd();
    default:
      return IGNORED.has(node.name) ? '' : unsupported();
  }
}

/** One equation as LaTeX, or `null` when it should stay flagged for a person. */
export function ommlToLatex(omml: string): string | null {
  try {
    const latex = row(parseXml(omml));
    return /^[\x20-\x7e]+$/.test(latex) ? latex : null;
  } catch {
    return null;
  }
}
