import { linearizeOmml, loadJsZip, replaceEquations } from './docx-equations';
import { extractDocxContent, htmlToLines, parseQuestions } from './docx-import';

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
