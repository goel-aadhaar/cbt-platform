import { parseQuestions } from './docx-import';

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
