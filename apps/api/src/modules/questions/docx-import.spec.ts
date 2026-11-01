import { sanitizeQuestionText } from '../../common/html/sanitize-html';
import {
  injectEquationPlaceholders,
  linearizeOmml,
  loadJsZip,
  replaceEquations,
  replaceSymbolRuns,
} from './docx-equations';
import { extractDocxContent, htmlToLines, parseQuestions } from './docx-import';

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

  it('joins continuation lines into the statement', () => {
    const [q] = parseQuestions(
      'Q: A long question\nthat wraps across lines\nAnswer: A',
    );
    expect(q.statement).toBe('A long question that wraps across lines');
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

  it('replaces inline and display equations with placeholder runs', () => {
    const { xml, count } = replaceEquations(
      `<w:p><w:r><w:t>Solve </w:t></w:r>${OMML}</w:p>` +
        `<w:p><m:oMathPara>${OMML}</m:oMathPara></w:p>`,
    );
    expect(count).toBe(2);
    expect(xml).not.toContain('m:oMath');
    expect(xml.match(/\[\[EQ: xy\^\(2\)\]\]/g)).toHaveLength(2);
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
    expect(qs[0].statement).toBe('Evaluate [[EQ: xy^(2)]]');
    expect(qs[0].sourceLabel).toBe('1');
    expect(qs[1].statement).toBe('Plain question?');
    expect(qs.map((q) => q.sourceSeq)).toEqual([1, 2]);
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
    expect(q.statement).toBe('Pick A)');
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
