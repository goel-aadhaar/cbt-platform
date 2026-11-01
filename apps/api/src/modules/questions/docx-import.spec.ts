import { sanitizeQuestionText } from '../../common/html/sanitize-html';
import {
  injectEquationPlaceholders,
  linearizeOmml,
  loadJsZip,
  replaceEquations,
  replaceSymbolRuns,
  settleFormulas,
} from './docx-equations';
import { extractDocxContent, htmlToLines, parseQuestions } from './docx-import';
import { ommlToLatex } from './omml-to-latex';

/** The smallest .docx mammoth will open, with `body` as its document body. */
async function minimalDocx(body: string): Promise<Buffer> {
  const JSZip = loadJsZip();
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body +
      '</w:body></w:document>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * The DOCX import parser (§2.4) turns a teacher's Word paper into question
 * blocks. It must tolerate the shapes real documents take: `Q:` or numbered
 * markers, blank paragraphs between questions (mammoth emits `\n\n`), multi-line
 * statements, and metadata lines in any order.
 */
describe('parseQuestions (DOCX import, §2.4)', () => {
  it('parses an MCQ with options, answer and metadata', () => {
    const [q] = parseQuestions(
      [
        'Q: What is the SI unit of force?',
        'A) Joule',
        'B) Newton',
        'Answer: B',
        'Chapter: Mechanics',
        'Difficulty: EASY',
      ].join('\n'),
    );
    expect(q.statement).toBe('What is the SI unit of force?');
    expect(q.options).toEqual([
      { key: 'A', text: 'Joule' },
      { key: 'B', text: 'Newton' },
    ]);
    expect(q.answer).toBe('B');
    expect(q.meta).toEqual({ chapter: 'Mechanics', difficulty: 'EASY' });
  });

  it('splits questions on markers even without blank lines', () => {
    const qs = parseQuestions('Q: First?\nAnswer: A\nQ: Second?\nAnswer: B');
    expect(qs.map((q) => q.statement)).toEqual(['First?', 'Second?']);
  });

  it('tolerates the double newlines mammoth emits between paragraphs', () => {
    const qs = parseQuestions(
      'Q: First?\n\nAnswer: A\n\n\n\nQ: Second?\n\nAnswer: B',
    );
    expect(qs).toHaveLength(2);
    expect(qs[1].answer).toBe('B');
  });

  it('accepts numbered markers (1. and 1))', () => {
    const qs = parseQuestions('1. First?\nAnswer: A\n2) Second?\nAnswer: B');
    expect(qs.map((q) => q.statement)).toEqual(['First?', 'Second?']);
  });

  it('keeps the line breaks of a multi-line statement', () => {
    const [q] = parseQuestions(
      'Q: Assertion: a is true\nReason: b is true\nAnswer: A',
    );
    expect(q.statement).toBe('Assertion: a is true\nReason: b is true');
    expect(sanitizeQuestionText(q.statement)).toBe(
      'Assertion: a is true<br>Reason: b is true',
    );
  });

  it('does not break a paragraph that merely wraps in Word', async () => {
    const buffer = await minimalDocx(
      `<w:p><w:r><w:t>1. ${'long words '.repeat(40)}</w:t></w:r></w:p>` +
        '<w:p><w:r><w:t>Answer: A</w:t></w:r></w:p>',
    );
    const content = await extractDocxContent(buffer);
    const [q] = parseQuestions(content.text);
    expect(q.statement).not.toContain('\n');
  });

  it('keeps a Word line break inside a statement paragraph', () => {
    const [q] = parseQuestions(
      htmlToLines('<p>1. First line<br />Second line</p><p>Answer: A</p>'),
    );
    expect(sanitizeQuestionText(q.statement)).toBe('First line<br>Second line');
  });

  it('starts the statement on the line after a bare marker', () => {
    const [q] = parseQuestions('Q1.\nThe real text\nAnswer: A');
    expect(q.statement).toBe('The real text');
  });

  it('ignores preamble before the first question marker', () => {
    const qs = parseQuestions(
      'Physics Question Paper\nSection A\nQ: Real?\nAnswer: A',
    );
    expect(qs).toHaveLength(1);
    expect(qs[0].statement).toBe('Real?');
  });

  it('records a missing answer as null (importer reports it as failed)', () => {
    const [q] = parseQuestions('Q: No answer here?\nA) one\nB) two');
    expect(q.answer).toBeNull();
  });

  it('keeps a multi-key answer verbatim for MSQ resolution', () => {
    const [q] = parseQuestions('Q: Which?\nA) x\nB) y\nAnswer: A, B');
    expect(q.answer).toBe('A, B');
  });

  it('accepts bracketed and dotted option keys', () => {
    const [q] = parseQuestions('Q: Which?\n(A) first\nB. second\nAnswer: A');
    expect(q.options).toEqual([
      { key: 'A', text: 'first' },
      { key: 'B', text: 'second' },
    ]);
  });

  it('returns [] for a document with no question markers', () => {
    expect(parseQuestions('Just a heading\nand some prose')).toEqual([]);
  });
});

describe('match-the-following', () => {
  const PAPER = [
    '1. Match List I with List II:',
    'List I, List II',
    '(a) Mitosis (i) Two cells',
    '(b) Meiosis (ii) Four cells',
    '(c) Budding (iii) Yeast',
    '(d) Fission (iv) Amoeba',
    'Choose the correct code:',
    '(A) a-i, b-ii, c-iii, d-iv',
    '(B) a-ii, b-i, c-iii, d-iv',
    '(C) a-i, b-ii, c-iv, d-iii',
    '(D) a-ii, b-i, c-iv, d-iii',
    'Answer: A',
  ].join('\n');

  it('keeps the list in the statement, in order, and the real options as options', () => {
    const [q] = parseQuestions(PAPER);
    expect(q.statement.split('\n')).toEqual([
      'Match List I with List II:',
      'List I, List II',
      '(a) Mitosis (i) Two cells',
      '(b) Meiosis (ii) Four cells',
      '(c) Budding (iii) Yeast',
      '(d) Fission (iv) Amoeba',
      'Choose the correct code:',
    ]);
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.options[0].text).toBe('a-i, b-ii, c-iii, d-iv');
    expect(q.answer).toBe('A');
  });

  it('copes with a list longer than the options', () => {
    const [q] = parseQuestions(
      '1. Match\na) one\nb) two\nc) three\nd) four\ne) five\nA) x\nB) y\nAnswer: B',
    );
    expect(q.statement).toContain('e) five');
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B']);
  });

  it('treats the list per question, so the next one is not affected', () => {
    const qs = parseQuestions(`${PAPER}\n2. Plain?\nA) x\nB) y\nAnswer: A`);
    expect(qs).toHaveLength(2);
    expect(qs[1].statement).toBe('Plain?');
    expect(qs[1].options.map((o) => o.key)).toEqual(['A', 'B']);
  });

  it('leaves options alone when one key is merely repeated or out of order', () => {
    const [q] = parseQuestions('1. Pick\nB) x\nA) y\nB) z\nAnswer: A');
    expect(q.options.map((o) => o.key)).toEqual(['B', 'A', 'B']);
    expect(q.statement).toBe('Pick');
  });

  it('does not let a lettered list in the explanation take the options', () => {
    const [q] = parseQuestions(
      [
        '1. Pick',
        'A) x',
        'B) y',
        'Answer: A',
        'Explanation: two reasons',
        '(a) first',
        '(b) second',
      ].join('\n'),
    );
    expect(q.statement).toBe('Pick');
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B']);
    expect(q.meta.explanation).toBe('two reasons\n(a) first\n(b) second');
  });
});

describe('multi-line explanations', () => {
  it('keeps later lines in the explanation and out of the statement', () => {
    const [q] = parseQuestions(
      'Q: Pick\nA) x\nAnswer: A\nExplanation: Step one\nStep two\nStep three\nQ: Next\nAnswer: B',
    );
    expect(q.statement).toBe('Pick');
    expect(sanitizeQuestionText(q.meta.explanation)).toBe(
      'Step one<br>Step two<br>Step three',
    );
  });

  it('takes the explanation from the lines after a bare heading', () => {
    for (const heading of ['Explanation:', 'Explanation', 'EXPLANATION -']) {
      const [q] = parseQuestions(
        `Q: Pick\nA) x\nAnswer: A\n${heading}\nStep one\nStep two`,
      );
      expect(q.statement).toBe('Pick');
      expect(q.meta.explanation).toBe('Step one\nStep two');
    }
  });

  it('keeps formatting on every line of an explanation', () => {
    const [q] = parseQuestions(
      htmlToLines(
        '<p>1. Pick</p><p>A) x</p><p>Answer: A</p>' +
          '<p><strong>Explanation:</strong></p>' +
          '<p>H<sub>2</sub>O is <strong>water</strong></p><p>x<sup>2</sup> grows</p>',
      ),
    );
    expect(sanitizeQuestionText(q.meta.explanation)).toBe(
      'H<sub>2</sub>O is <strong>water</strong><br>x<sup>2</sup> grows',
    );
  });

  it('does not take the answer from a sentence in the explanation', () => {
    const [q] = parseQuestions(
      'Q: Pick\nA) x\nB) y\nAnswer: A\nExplanation: Why\nCorrect option is B in the old key',
    );
    expect(q.answer).toBe('A');
    expect(q.meta.explanation).toContain('Correct option is B');
  });

  it('still reads an answer and metadata that come after the explanation', () => {
    const [q] = parseQuestions(
      'Q: Pick\nA) x\nExplanation: Why\nmore\nAnswer: A\nDifficulty: HARD',
    );
    expect(q.answer).toBe('A');
    expect(q.meta).toEqual({ explanation: 'Why\nmore', difficulty: 'HARD' });
  });

  it('still reads options that come after the explanation', () => {
    const [q] = parseQuestions('Q: Pick\nExplanation: Why\nA) x\nAnswer: A');
    expect(q.options).toEqual([{ key: 'A', text: 'x' }]);
    expect(q.meta.explanation).toBe('Why');
  });
});

describe('question numbering (source order)', () => {
  it('records the marker number and the position of every block, in order', () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `${i + 1}. Question number ${i + 1}?\nA) x\nB) y\nAnswer: A`,
    ).join('\n');
    const qs = parseQuestions(text);
    expect(qs).toHaveLength(30);
    expect(qs.map((q) => q.sourceSeq)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(qs.map((q) => q.sourceLabel)).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i + 1)),
    );
    expect(qs[9].statement).toBe('Question number 10?');
  });

  it('keeps the file order when the numbering itself jumps', () => {
    const qs = parseQuestions(
      'Q1. one\nAnswer: A\nQ10. ten\nAnswer: A\nQ3. three\nAnswer: A',
    );
    expect(qs.map((q) => [q.sourceSeq, q.sourceLabel])).toEqual([
      [1, 'Q1'],
      [2, 'Q10'],
      [3, 'Q3'],
    ]);
  });

  it('understands Q-prefixed, bare-number and "Question N." markers', () => {
    const qs = parseQuestions(
      'Q4: a\nAnswer: A\nQuestion 5. b\nAnswer: A\n6) c\nAnswer: A\nQ: d\nAnswer: A',
    );
    expect(qs.map((q) => q.sourceLabel)).toEqual(['Q4', 'Q5', '6', undefined]);
    expect(qs.map((q) => q.statement)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not split a question on "2.5 m/s" or a lone "3)" line', () => {
    const qs = parseQuestions(
      [
        '1. A car goes',
        '2.5 m/s is its speed. How far in 4 s?',
        '3)',
        'A) 10 m',
        'B) 20 m',
        'Answer: A',
        '2. Next?',
        'Answer: B',
      ].join('\n'),
    );
    expect(qs).toHaveLength(2);
    expect(qs[0].statement).toContain('2.5 m/s is its speed');
    expect(qs[0].statement).toContain('3)');
    expect(qs[1].sourceLabel).toBe('2');
  });

  it('leaves a gap in sourceSeq for a marker with nothing after it', () => {
    const qs = parseQuestions('1. a\nAnswer: A\nQ2.\nQ3. c\nAnswer: A');
    expect(qs.map((q) => q.sourceSeq)).toEqual([1, 3]);
  });
});

describe('htmlToLines (Word auto-numbered lists)', () => {
  it('numbers top-level list items as questions and letters nested options', () => {
    const html =
      '<ol><li>First?<ol><li>red</li><li>blue</li></ol></li><li>Second?</li></ol>';
    const lines = htmlToLines(html).split('\n').filter(Boolean);
    expect(lines).toEqual(['1. First?', 'A) red', 'B) blue', '2. Second?']);
  });

  it('continues the numbering across lists split by other paragraphs', () => {
    const html =
      '<ol><li>One?</li></ol><p>A) a</p><p>Answer: A</p><ol><li>Two?</li></ol>';
    const qs = parseQuestions(htmlToLines(html));
    expect(qs.map((q) => q.sourceLabel)).toEqual(['1', '2']);
    expect(qs[0].options).toEqual([{ key: 'A', text: 'a' }]);
  });

  it('letters a list as options when the document types its own markers', () => {
    const html =
      '<p>1. Pick one</p><ol><li>red</li><li>blue</li></ol><p>Answer: B</p>';
    const [q] = parseQuestions(htmlToLines(html));
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B']);
    expect(q.sourceLabel).toBe('1');
  });

  it('does not double-number an item that already has a marker', () => {
    const lines = htmlToLines('<ol><li>1. Typed?</li></ol>').trim();
    expect(lines).toBe('1. Typed?');
  });
});

describe('Word equations', () => {
  const OMML =
    '<m:oMath><m:r><m:t>x</m:t></m:r><m:sSup><m:e><m:r><m:t>y</m:t></m:r></m:e>' +
    '<m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>';

  it('linearizes an equation to readable text', () => {
    expect(linearizeOmml(OMML)).toBe('xy^(2)');
    expect(
      linearizeOmml(
        '<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>',
      ),
    ).toBe('(1)/(2)');
  });

  // A matrix: not converted, so the placeholder path stays exercised.
  const FLAGGED =
    '<m:oMath><m:r><m:t>A=</m:t></m:r><m:m><m:mr><m:e><m:r><m:t>y</m:t></m:r></m:e></m:mr></m:m></m:oMath>';

  it('replaces inline and display equations it cannot convert with placeholder runs', () => {
    const { xml, count } = replaceEquations(
      `<w:p><w:r><w:t>Solve </w:t></w:r>${FLAGGED}</w:p>` +
        `<w:p><m:oMathPara>${FLAGGED}</m:oMathPara></w:p>`,
    );
    expect(count).toBe(2);
    expect(xml).not.toContain('m:oMath');
    expect(xml.match(/\[\[EQ: A=y\]\]/g)).toHaveLength(2);
  });

  it('turns inline and display equations it can convert into formulas', () => {
    const { xml, count } = replaceEquations(
      `<w:p><w:r><w:t>Solve </w:t></w:r>${OMML}</w:p>` +
        `<w:p><m:oMathPara>${OMML}</m:oMathPara></w:p>`,
    );
    expect(count).toBe(2);
    expect(xml).not.toContain('m:oMath');
    expect(xml).not.toContain('[[EQ');
    expect(settleFormulas(xml).match(/\$xy\^\{2\}\$/g)).toHaveLength(2);
  });

  it('survives a real .docx round trip through mammoth and the parser', async () => {
    const JSZip = loadJsZip();
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    );
    const p = (text: string) =>
      `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    zip.file(
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>' +
        `<w:p><w:r><w:t xml:space="preserve">1. Evaluate </w:t></w:r>${OMML}</w:p>` +
        p('A) one') +
        p('B) two') +
        p('Answer: A') +
        p('2. Plain question?') +
        p('A) yes') +
        p('B) no') +
        p('Answer: B') +
        '</w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const content = await extractDocxContent(buffer);
    expect(content.equations).toBe(1);
    const qs = parseQuestions(content.text, content.images);
    expect(qs).toHaveLength(2);
    expect(qs[0].statement).toBe('Evaluate $xy^{2}$');
    expect(qs[0].sourceLabel).toBe('1');
    expect(qs[1].statement).toBe('Plain question?');
    expect(qs.map((q) => q.sourceSeq)).toEqual([1, 2]);
  });

  describe('through a real .docx', () => {
    const NS =
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
    const math = (inner: string) => `<m:oMath ${NS}>${inner}</m:oMath>`;
    const t = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;
    const r = (text: string) =>
      `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
    const p = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
    const parse = async (body: string) => {
      const content = await extractDocxContent(await minimalDocx(body));
      return parseQuestions(content.text, content.images);
    };

    it('puts formulas in the statement, options and explanation', async () => {
      const [q] = await parse(
        p(r('1. If '), math(t('a&lt;b')), r(' then?')) +
          p(r('A) '), math(t('b&gt;a'))) +
          p(r('B) none')) +
          p(r('Answer: A')) +
          p(r('Explanation: since '), math(t('a≤b'))),
      );
      expect(q.statement).toBe('If $a\\lt b$ then?');
      expect(q.options[0].text).toBe('$b\\gt a$');
      expect(q.meta.explanation).toBe('since $a\\le b$');
    });

    it('keeps an equation that is a whole line, on its own line', async () => {
      const [q] = await parse(
        p(r('1. Solve')) + p(math(t('x=2'))) + p(r('Answer: A')),
      );
      expect(sanitizeQuestionText(q.statement)).toBe('Solve<br>$x=2$');
    });

    it('stays the same formula through the sanitizer, however often', async () => {
      const [q] = await parse(
        p(r('1. Find '), math(t('a&amp;b&lt;c&gt;d')), r(' &amp; go')) +
          p(r('Answer: A')),
      );
      expect(q.statement).toBe('Find $a\\&b\\lt c\\gt d$ & go');
      const once = sanitizeQuestionText(q.statement);
      expect(once).toBe('Find $a\\&amp;b\\lt c\\gt d$ &amp; go');
      expect(sanitizeQuestionText(once)).toBe(once);
    });

    it('does not lose letters that look like a tag between < and >', async () => {
      const [q] = await parse(p(r('1. '), math(t('a&lt;b&gt;c'))));
      expect(sanitizeQuestionText(q.statement)).toBe('$a\\lt b\\gt c$');
    });

    it('keeps two neighbouring equations apart', async () => {
      const [q] = await parse(p(r('1. '), math(t('a')), math(t('b'))));
      const once = sanitizeQuestionText(q.statement);
      expect(once).toBe('$a$$b$');
      expect(sanitizeQuestionText(once)).toBe(once);
    });

    it('keeps a formula next to a price', async () => {
      const [q] = await parse(
        p(r('1. It costs $5 for '), math(t('x'))) +
          p(r('A) '), math(t('y'))) +
          p(r('Answer: A')),
      );
      expect(q.statement).toBe('It costs $5 for $x$');
      expect(q.options[0].text).toBe('$y$');
    });

    it('keeps a formula below a line with a price', async () => {
      const [q] = await parse(
        p(r('1. It costs $5')) + p(r('Find '), math(t('x'))),
      );
      expect(q.statement).toBe('It costs $5\nFind $x$');
      expect(sanitizeQuestionText(q.statement)).toBe('It costs $5<br>Find $x$');
    });

    it('flags a formula a dollar sign in the text would pair with', async () => {
      // "Find $y" + "$x$" reads as the formula `$y$` and a stray `x$`.
      const [q] = await parse(p(r('1. Find $y'), math(t('x'))));
      expect(q.statement).toBe('Find $y[[EQ: x]]');
    });

    it('leaves LaTeX the author typed as text alone', async () => {
      const [q] = await parse(p(r('1. Find $x^2$')));
      expect(q.statement).toBe('Find $x^2$');
    });

    it('keeps an equation it cannot convert flagged, among ones it can', async () => {
      const [q] = await parse(
        p(
          r('1. '),
          math(t('a')),
          r(' and '),
          math('<m:m><m:mr><m:e>' + t('b') + '</m:e></m:mr></m:m>'),
        ),
      );
      expect(q.statement).toBe('$a$ and [[EQ: b]]');
    });

    it('does not leave its private characters in any field', async () => {
      const qs = await parse(
        p(r('1. '), math(t('a'))) +
          p(r('A) '), math(t('b'))) +
          p(r('Answer: '), math(t('c'))) +
          p(r('Topic: '), math(t('d'))) +
          p(r('Explanation: '), math(t('e'))),
      );
      expect(JSON.stringify(qs)).not.toMatch(/[-]/);
    });
  });
});

describe('ommlToLatex', () => {
  const t = (text: string, props = '') =>
    `<m:r>${props ? `<m:rPr>${props}</m:rPr>` : ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t>${text}</m:t></m:r>`;
  const arg = (name: string, text: string) => `<${name}>${t(text)}</${name}>`;
  const e = (text: string) => arg('m:e', text);
  const ctrl = '<m:ctrlPr><w:rPr><w:i/></w:rPr></m:ctrlPr>';
  const math = (inner: string) => `<m:oMath>${inner}</m:oMath>`;

  it.each([
    ['a plain run', t('x+y=2'), 'x+y=2'],
    ['spaces', t('x + y'), 'x + y'],
    ['several runs', t('a') + t('b'), 'ab'],
    [
      'a superscript',
      `<m:sSup><m:sSupPr>${ctrl}</m:sSupPr>${e('x')}${arg('m:sup', '2')}</m:sSup>`,
      'x^{2}',
    ],
    ['a subscript', `<m:sSub>${e('v')}${arg('m:sub', '0')}</m:sSub>`, 'v_{0}'],
    [
      'both scripts',
      `<m:sSubSup>${e('x')}${arg('m:sub', 'i')}${arg('m:sup', '2')}</m:sSubSup>`,
      'x_{i}^{2}',
    ],
    [
      'a script over a long base',
      `<m:sSup>${e('ab')}${arg('m:sup', '2')}</m:sSup>`,
      '{ab}^{2}',
    ],
    [
      'scripts in scripts',
      `<m:sSup><m:e><m:sSup>${e('x')}${arg('m:sup', '2')}</m:sSup></m:e>${arg('m:sup', '3')}</m:sSup>`,
      '{x^{2}}^{3}',
    ],
    [
      'a fraction',
      `<m:f><m:fPr><m:type m:val="bar"/>${ctrl}</m:fPr>${arg('m:num', '1')}${arg('m:den', '2')}</m:f>`,
      '\\frac{1}{2}',
    ],
    [
      'a fraction with no properties',
      `<m:f>${arg('m:num', 'a')}${arg('m:den', 'b')}</m:f>`,
      '\\frac{a}{b}',
    ],
    [
      'a linear fraction',
      `<m:f><m:fPr><m:type m:val="lin"/></m:fPr>${arg('m:num', 'a')}${arg('m:den', 'b')}</m:f>`,
      '\\frac{a}{b}',
    ],
    [
      'a square root',
      `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e('x')}</m:rad>`,
      '\\sqrt{x}',
    ],
    [
      'a root with no degree given',
      `<m:rad><m:deg/>${e('x')}</m:rad>`,
      '\\sqrt{x}',
    ],
    [
      'a cube root',
      `<m:rad>${arg('m:deg', '3')}${e('x')}</m:rad>`,
      '\\sqrt[3]{x}',
    ],
    [
      'a degree that is shown even with degHide off',
      `<m:rad><m:radPr><m:degHide m:val="0"/></m:radPr>${arg('m:deg', 'n')}${e('x')}</m:rad>`,
      '\\sqrt[n]{x}',
    ],
    ['round brackets', `<m:d>${e('x')}</m:d>`, '\\left(x\\right)'],
    [
      'square brackets',
      `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>${e('x')}</m:d>`,
      '\\left[x\\right]',
    ],
    [
      'curly brackets',
      `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val="}"/></m:dPr>${e('x')}</m:d>`,
      '\\left\\{x\\right\\}',
    ],
    [
      'modulus',
      `<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr>${e('x')}</m:d>`,
      '\\left|x\\right|',
    ],
    [
      'one side only',
      `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr>${e('x')}</m:d>`,
      '\\left\\{x\\right.',
    ],
    [
      'an angle bracket before a letter',
      `<m:d><m:dPr><m:begChr m:val="⟨"/><m:endChr m:val="⟩"/></m:dPr>${e('x')}</m:d>`,
      '\\left\\langle x\\right\\rangle',
    ],
    [
      'brackets with several parts',
      `<m:d><m:dPr><m:sepChr m:val=","/></m:dPr>${e('x')}${e('y')}</m:d>`,
      '\\left(x,y\\right)',
    ],
    [
      'a sum with limits',
      `<m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr>${arg('m:sub', 'i=1')}${arg('m:sup', 'n')}${e('i')}</m:nary>`,
      '\\sum_{i=1}^{n} i',
    ],
    [
      'an integral, which Word leaves unnamed',
      `<m:nary><m:naryPr><m:limLoc m:val="subSup"/></m:naryPr>${arg('m:sub', '0')}${arg('m:sup', '1')}${e('x')}</m:nary>`,
      '\\int_{0}^{1} x',
    ],
    [
      'an operator with hidden limits',
      `<m:nary><m:naryPr><m:chr m:val="∏"/><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/>${e('x')}</m:nary>`,
      '\\prod x',
    ],
    ['Greek before a letter', t('αx'), '\\alpha x'],
    [
      'Greek before a script',
      `<m:sSup>${e('θ')}${arg('m:sup', '2')}</m:sSup>`,
      '\\theta^{2}',
    ],
    ['capital Greek', t('ΔΣΩ'), '\\Delta\\Sigma\\Omega'],
    ["Word's increment sign", t('∆x'), '\\Delta x'],
    ['less and greater than', t('a&lt;b&gt;c'), 'a\\lt b\\gt c'],
    ['an ampersand', t('a&amp;b'), 'a\\&b'],
    ['percent and hash', t('5%#'), '5\\%\\#'],
    ['underscore and braces', t('a_{b}'), 'a\\_\\{b\\}'],
    ['operators', t('a×b÷c±d'), 'a\\times b\\div c\\pm d'],
    ['relations', t('a≤b≥c≠d≈e'), 'a\\le b\\ge c\\ne d\\approx e'],
    ['arrows', t('A→B⇌C'), 'A\\rightarrow B\\rightleftharpoons C'],
    ['Unicode minus', t('a−b'), 'a-b'],
    ['degrees', t('30°'), '30\\degree'],
    ['primes', t('f′'), "f'"],
    ['invisible operators', t('a⁢b⁡c'), 'abc'],
    ['upright text', t('km', '<m:sty m:val="p"/>'), '\\mathrm{km}'],
    ['bold text', t('F', '<m:sty m:val="b"/>'), '\\mathbf{F}'],
    ['bold italic', t('v', '<m:sty m:val="bi"/>'), '\\boldsymbol{v}'],
    ['italic, the default', t('x', '<m:sty m:val="i"/>'), 'x'],
    ['normal text', t('in metres', '<m:nor/>'), '\\text{in metres}'],
    [
      'an overbar',
      `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${e('x')}</m:bar>`,
      '\\overline{x}',
    ],
    [
      'an underbar',
      `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${e('x')}</m:bar>`,
      '\\underline{x}',
    ],
    [
      'a vector accent',
      `<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr>${e('v')}</m:acc>`,
      '\\vec{v}',
    ],
    [
      'a dot accent',
      `<m:acc><m:accPr><m:chr m:val="̇"/></m:accPr>${e('x')}</m:acc>`,
      '\\dot{x}',
    ],
    [
      'a hat, which Word leaves unnamed',
      `<m:acc>${e('x')}</m:acc>`,
      '\\hat{x}',
    ],
    [
      'a function',
      `<m:func><m:fName>${t('sin', '<m:sty m:val="p"/>')}</m:fName>${e('θ')}</m:func>`,
      '\\sin \\theta',
    ],
    [
      'a function with a power',
      `<m:func><m:fName><m:sSup><m:e>${t('cos', '<m:sty m:val="p"/>')}</m:e>${arg('m:sup', '2')}</m:sSup></m:fName>${e('x')}</m:func>`,
      '\\cos^{2} x',
    ],
    [
      'a function LaTeX has no command for',
      `<m:func><m:fName>${t('cosec', '<m:sty m:val="p"/>')}</m:fName>${e('x')}</m:func>`,
      '\\mathrm{cosec} x',
    ],
    [
      'structures inside structures',
      `<m:f><m:num><m:rad><m:deg/>${e('b')}</m:rad></m:num>${arg('m:den', '2a')}</m:f>`,
      '\\frac{\\sqrt{b}}{2a}',
    ],
    [
      'a bookmark, which says nothing',
      `<w:bookmarkStart w:id="1" w:name="x"/>${t('x')}<w:bookmarkEnd w:id="1"/>`,
      'x',
    ],
  ])('converts %s', (_name, inner, latex) => {
    expect(ommlToLatex(math(inner))).toBe(latex);
  });

  it('copes with XML that is laid out over several lines', () => {
    expect(
      ommlToLatex(
        `<m:oMath>\n  <m:sSup>\n    ${e('x')}\n    ${arg('m:sup', '2')}\n  </m:sSup>\n</m:oMath>`,
      ),
    ).toBe('x^{2}');
  });

  it.each([
    ['a matrix', `<m:m><m:mr>${e('x')}</m:mr></m:m>`],
    ['an equation array', `<m:eqArr>${e('x')}</m:eqArr>`],
    ['a limit', `<m:limLow>${e('lim')}${arg('m:lim', 'x')}</m:limLow>`],
    [
      'a pre-script',
      `<m:sPre>${arg('m:sub', '2')}${arg('m:sup', '3')}${e('x')}</m:sPre>`,
    ],
    ['a stacked brace', `<m:groupChr>${e('x')}</m:groupChr>`],
    ['a box', `<m:borderBox>${e('x')}</m:borderBox>`],
    [
      'an unknown element deep inside',
      `<m:f><m:num><m:rad><m:deg/><m:e><m:mystery/></m:e></m:rad></m:num>${arg('m:den', '2')}</m:f>`,
    ],
    [
      'an unknown element next to a part',
      `<m:sSup>${e('x')}${arg('m:sup', '2')}<m:mystery/></m:sSup>`,
    ],
    [
      'a fraction with no bar',
      `<m:f><m:fPr><m:type m:val="noBar"/></m:fPr>${arg('m:num', 'n')}${arg('m:den', 'r')}</m:f>`,
    ],
    [
      'a fraction type it does not know',
      `<m:f><m:fPr><m:type m:val="odd"/></m:fPr>${arg('m:num', 'n')}${arg('m:den', 'r')}</m:f>`,
    ],
    ['a missing denominator', `<m:f>${arg('m:num', '1')}</m:f>`],
    ['a superscript with no exponent', `<m:sSup>${e('x')}</m:sSup>`],
    ['a bar with no position', `<m:bar>${e('x')}</m:bar>`],
    [
      'an unknown bracket',
      `<m:d><m:dPr><m:begChr m:val="⟦"/></m:dPr>${e('x')}</m:d>`,
    ],
    [
      'an unknown operator',
      `<m:nary><m:naryPr><m:chr m:val="⨁"/></m:naryPr><m:sub/><m:sup/>${e('x')}</m:nary>`,
    ],
    [
      'an unknown accent',
      `<m:acc><m:accPr><m:chr m:val="⃡"/></m:accPr>${e('x')}</m:acc>`,
    ],
    ['an unknown run style', t('x', '<m:sty m:val="zz"/>')],
    ['script letters', t('L', '<m:scr m:val="script"/>')],
    ['a character it does not know', t('x⊕y')],
    ['a Hindi letter', t('क')],
    ['a mathematical italic letter', t('\u{1d465}')],
    ['a dollar sign', t('$5')],
    ['a backslash', t('\\alpha')],
    ['a caret', t('x^2')],
    ['normal text with a symbol', t('α rays', '<m:nor/>')],
    ['a line break in a run', '<m:r><w:br/><m:t>x</m:t></m:r>'],
    ['a tracked change', `<w:ins w:id="1">${t('x')}</w:ins>`],
    [
      'a Symbol-font run',
      '<m:r><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr><m:t>a</m:t></m:r>',
    ],
    ['stray text', `<m:sSup>oops${e('x')}${arg('m:sup', '2')}</m:sSup>`],
    ['nothing at all', ''],
    ['only spaces', t('   ')],
  ])('leaves %s flagged', (_name, inner) => {
    expect(ommlToLatex(math(inner))).toBeNull();
  });

  it('refuses XML it cannot read', () => {
    expect(ommlToLatex('')).toBeNull();
    expect(ommlToLatex('<m:oMath><m:r>')).toBeNull();
    expect(ommlToLatex('<m:oMath></m:r></m:oMath>')).toBeNull();
    expect(ommlToLatex('<m:oMath>< bad</m:oMath>')).toBeNull();
  });

  it('flags the whole equation when one part is unknown', () => {
    const { xml } = replaceEquations(
      math(`${t('x=')}<m:m><m:mr>${e('y')}</m:mr></m:m>`),
    );
    expect(settleFormulas(xml)).toContain('[[EQ: x=y]]');
    expect(settleFormulas(xml)).not.toContain('$');
  });
});

/** The minimal JSZip typing only takes strings; the real library takes bytes. */
function addBinary(zip: object, name: string, data: Buffer) {
  (zip as { file: (n: string, d: Buffer) => void }).file(name, data);
}

describe('images inside options', () => {
  const img = (n: number) => ({
    token: `[[IMAGE:${n}]]`,
    contentType: 'image/png',
    buffer: Buffer.from([n]),
  });

  it('attaches an image that follows an option line to that option', () => {
    const [q] = parseQuestions(
      [
        'Q: Which circuit?',
        '[[IMAGE:0]]',
        'A) first',
        '[[IMAGE:1]]',
        'B) second',
        'Answer: A',
      ].join('\n'),
      [img(0), img(1)],
    );
    // The image before any option is the stem's; the one after A) is A's.
    expect(q.images.map((i) => i.token)).toEqual(['[[IMAGE:0]]']);
    expect(q.options[0].image?.token).toBe('[[IMAGE:1]]');
    expect(q.options[1].image).toBeUndefined();
  });

  it('recognises an option that is only an image ("A)" then the picture)', () => {
    const [q] = parseQuestions(
      ['Q: Pick', 'A)', '[[IMAGE:0]]', 'B.', '[[IMAGE:1]]', 'Answer: B'].join(
        '\n',
      ),
      [img(0), img(1)],
    );
    expect(q.options.map((o) => [o.key, o.text, o.image?.token])).toEqual([
      ['A', '', '[[IMAGE:0]]'],
      ['B', '', '[[IMAGE:1]]'],
    ]);
    expect(q.images).toEqual([]);
  });

  it('does not treat a bare "A)" as an option unless an image follows', () => {
    const [q] = parseQuestions(
      ['Q: Pick', 'A)', 'B) x', 'Answer: B'].join('\n'),
    );
    expect(q.options).toEqual([{ key: 'B', text: 'x' }]);
    expect(q.statement).toBe('Pick\nA)');
  });

  it('sends an image after the Answer line (or metadata) back to the stem', () => {
    const [q] = parseQuestions(
      ['Q: Pick', 'A) one', 'Answer: A', '[[IMAGE:0]]'].join('\n'),
      [img(0)],
    );
    expect(q.options[0].image).toBeUndefined();
    expect(q.images).toHaveLength(1);
  });

  it('keeps only the first image for an option and never moves it to the stem', () => {
    const [q] = parseQuestions(
      ['Q: Pick', 'A) one', '[[IMAGE:0]]', '[[IMAGE:1]]', 'Answer: A'].join(
        '\n',
      ),
      [img(0), img(1)],
    );
    expect(q.options[0].image?.token).toBe('[[IMAGE:0]]');
    expect(q.images).toEqual([]);
  });

  it('survives a real .docx round trip with a picture in an option', async () => {
    const JSZip = loadJsZip();
    const zip = new JSZip();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    );
    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/a.png"/>' +
        '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/b.png"/>' +
        '</Relationships>',
    );
    addBinary(zip, 'word/media/a.png', png);
    addBinary(zip, 'word/media/b.png', png);
    const p = (text: string) =>
      `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const drawing = (rid: string) =>
      '<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      `<pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic>` +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    zip.file(
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
        p('1. Which waveform?') +
        `<w:p><w:r><w:t xml:space="preserve">A) </w:t></w:r>${drawing('rId5')}</w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">B) square wave</w:t></w:r>${drawing('rId6')}</w:p>` +
        p('Answer: A') +
        '</w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const content = await extractDocxContent(buffer);
    expect(content.images).toHaveLength(2);
    const [q] = parseQuestions(content.text, content.images);
    expect(q.statement).toBe('Which waveform?');
    expect(q.images).toEqual([]);
    expect(q.options.map((o) => [o.key, o.text, !!o.image])).toEqual([
      ['A', '', true],
      ['B', 'square wave', true],
    ]);
  });
});

describe('inline formatting survives the line parser', () => {
  const parseHtml = (html: string) => parseQuestions(htmlToLines(html));

  it('keeps bold on part of a statement', () => {
    const [q] = parseHtml(
      '<p>1. Which is <strong>not</strong> a noble gas?</p><p>Answer: A</p>',
    );
    expect(q.statement).toBe('Which is <strong>not</strong> a noble gas?');
  });

  it('keeps every mark in statements and options', () => {
    const [q] = parseHtml(
      '<p>Q1. <em>Balance</em> H<sub>2</sub>O and x<sup>2</sup> with <u>care</u> and <s>haste</s></p>' +
        '<p>A) CO<sub>2</sub></p><p>B) 10<sup>3</sup></p><p>Answer: A</p>',
    );
    expect(q.statement).toBe(
      '<em>Balance</em> H<sub>2</sub>O and x<sup>2</sup> with <u>care</u> and <s>haste</s>',
    );
    expect(q.options).toEqual([
      { key: 'A', text: 'CO<sub>2</sub>' },
      { key: 'B', text: '10<sup>3</sup>' },
    ]);
  });

  it('recognises a bold question marker and leaves it out of the text', () => {
    const [q] = parseHtml(
      '<p><strong>Q1.</strong> Plain text here</p><p>Answer: A</p>',
    );
    expect(q.sourceLabel).toBe('Q1');
    expect(q.statement).toBe('Plain text here');
  });

  it('reopens a mark the question marker cut through', () => {
    const [q] = parseHtml(
      '<p><strong>Q1. What is</strong> this?</p><p>Answer: A</p>',
    );
    expect(q.statement).toBe('<strong>What is</strong> this?');
  });

  it('recognises a bold option letter and keeps the bold of its text', () => {
    const [q] = parseHtml(
      '<p>1. Pick</p><p><strong>A)</strong> plain</p><p><strong>B) all bold</strong></p><p>Answer: B</p>',
    );
    expect(q.options).toEqual([
      { key: 'A', text: 'plain' },
      { key: 'B', text: '<strong>all bold</strong>' },
    ]);
  });

  it('keeps the answer and metadata plain but the explanation formatted', () => {
    const [q] = parseHtml(
      '<p>1. Pick</p><p>A) x</p><p><strong>Answer: A</strong></p>' +
        '<p><strong>Difficulty:</strong> <em>HARD</em></p>' +
        '<p>Explanation: H<sub>2</sub> is <strong>light</strong></p>',
    );
    expect(q.answer).toBe('A');
    expect(q.meta.difficulty).toBe('HARD');
    expect(q.meta.explanation).toBe('H<sub>2</sub> is <strong>light</strong>');
  });

  it('keeps a run of bold that spans a Word line break on both lines', () => {
    const [q] = parseHtml(
      '<p>1. <strong>First line<br />A) second line</strong></p><p>Answer: A</p>',
    );
    expect(q.statement).toBe('<strong>First line</strong>');
    expect(q.options).toEqual([
      { key: 'A', text: '<strong>second line</strong>' },
    ]);
  });

  it('skips a line that holds only empty formatting', () => {
    const qs = parseHtml(
      '<p>1. One</p><p><strong></strong></p><p>Answer: A</p>',
    );
    expect(qs[0].statement).toBe('One');
    expect(qs[0].answer).toBe('A');
  });

  it('matches an image token even inside formatting', () => {
    const img = {
      token: '[[IMAGE:0]]',
      contentType: 'image/png',
      buffer: Buffer.from([0]),
    };
    const [q] = parseQuestions(
      htmlToLines(
        '<p>1. Pick</p><p><strong>A)</strong></p><p><strong><img alt="[[IMAGE:0]]" /></strong></p><p>Answer: A</p>',
      ),
      [img],
    );
    expect(q.options[0].image?.token).toBe('[[IMAGE:0]]');
  });

  it('numbers a Word list whose items start in bold', () => {
    const qs = parseHtml(
      '<ol><li><strong>First?</strong></li><li><em>Second?</em></li></ol>',
    );
    expect(qs.map((q) => q.sourceLabel)).toEqual(['1', '2']);
    expect(qs[0].statement).toBe('<strong>First?</strong>');
  });

  it('sees a bold typed marker when deciding how to number lists', () => {
    const [q] = parseHtml(
      '<p><strong>1.</strong> Pick one</p><ol><li>red</li><li>blue</li></ol><p>Answer: B</p>',
    );
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B']);
  });

  it('round-trips & and < from the document', () => {
    const [q] = parseHtml(
      '<p>1. Fe &amp; Cu when a &lt; b</p><p>A) x &amp; y</p><p>Answer: A</p>',
    );
    expect(sanitizeQuestionText(q.statement)).toBe('Fe &amp; Cu when a &lt; b');
    expect(sanitizeQuestionText(q.options[0].text)).toBe('x &amp; y');
  });

  it('treats <sub> typed as visible text in Word as formatting', () => {
    const [q] = parseHtml(
      '<p>1. CO&lt;sub&gt;2&lt;/sub&gt; is a gas</p><p>Answer: A</p>',
    );
    expect(sanitizeQuestionText(q.statement)).toBe('CO<sub>2</sub> is a gas');
  });

  it('leaves unformatted input exactly as it was', () => {
    const [q] = parseQuestions('Q1. a < b & c\nA) x\nAnswer: A');
    expect(q.statement).toBe('a < b & c');
  });
});

describe('Word Symbol font', () => {
  const run = (font: string, text: string) =>
    `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr>` +
    `<w:t xml:space="preserve">${text}</w:t></w:r>`;

  it('rewrites a Symbol run as the characters it shows', () => {
    const { xml, count } = replaceSymbolRuns(
      `<w:p><w:r><w:t>Plain a </w:t></w:r>${run('Symbol', 'a b')}</w:p>`,
    );
    expect(count).toBe(1);
    expect(xml).toContain('Plain a ');
    expect(xml).toContain('>α β</w:t>');
  });

  it('leaves runs in other fonts and XML entities alone', () => {
    const other = run('Times New Roman', 'a b');
    expect(replaceSymbolRuns(other)).toEqual({ xml: other, count: 0 });
    const { xml } = replaceSymbolRuns(run('Symbol', 'a &amp; &lt; b'));
    expect(xml).toContain('>α &amp; &lt; β</w:t>');
  });

  it('does not run a self-closing run into the next one', () => {
    const { xml } = replaceSymbolRuns(
      `<w:r w:rsidR="1"/><w:r><w:t>a</w:t></w:r>${run('Symbol', 'a')}`,
    );
    expect(xml).toContain('<w:r><w:t>a</w:t></w:r>');
    expect(xml).toContain('>α</w:t>');
  });

  it('returns a document with no Symbol text as the same buffer', async () => {
    const buffer = await minimalDocx('<w:p><w:r><w:t>1. Hi</w:t></w:r></w:p>');
    const out = await injectEquationPlaceholders(buffer);
    expect(out.buffer).toBe(buffer);
    expect(out.equations).toBe(0);
  });
});

describe('formatting through a real .docx', () => {
  const r = (text: string, props = '') =>
    `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  const p = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;

  it('keeps bold, italic, underline, subscript, superscript and symbols', async () => {
    const buffer = await minimalDocx(
      p(
        r('1. '),
        r('Which', '<w:b/>'),
        r(' is '),
        r('not', '<w:i/>'),
        r(' true?'),
      ) +
        p(r('A) H'), r('2', '<w:vertAlign w:val="subscript"/>'), r('O')) +
        p(r('B) x'), r('2', '<w:vertAlign w:val="superscript"/>')) +
        p(r('C) '), r('key', '<w:u w:val="single"/>')) +
        p(
          r('D) '),
          r('a', '<w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/>'),
          r(' &amp; b'),
        ) +
        p(r('Answer: A')),
    );
    const content = await extractDocxContent(buffer);
    const [q] = parseQuestions(content.text, content.images);
    expect(q.statement).toBe('<strong>Which</strong> is <em>not</em> true?');
    expect(q.options.map((o) => o.text)).toEqual([
      'H<sub>2</sub>O',
      'x<sup>2</sup>',
      '<u>key</u>',
      'α & b',
    ]);
    expect(q.answer).toBe('A');
  });

  it('keeps a character Word stored with its symbol element', async () => {
    const buffer = await minimalDocx(
      p(r('1. Angle '), '<w:r><w:sym w:font="Symbol" w:char="F071"/></w:r>') +
        p(r('Answer: A')),
    );
    const content = await extractDocxContent(buffer);
    const [q] = parseQuestions(content.text, content.images);
    expect(sanitizeQuestionText(q.statement)).toBe('Angle θ');
  });
});
