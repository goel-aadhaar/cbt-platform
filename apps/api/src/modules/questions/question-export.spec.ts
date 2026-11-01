import * as zlib from 'zlib';

import { BadRequestException } from '@nestjs/common';

import { ExportFormat } from './dto/export-questions.dto';
import { QuestionExportService } from './question-export.service';

/**
 * Real generated files, not just the service call (§ Product Structure §9:
 * "test the generated documents, not merely the API response").
 *
 * Both formats compress their text, so this decodes the ACTUAL bytes rather
 * than string-searching the raw buffer, which would silently pass even if
 * the feature were completely broken:
 *
 *  - PDF: pdfkit Flate-compresses each page's content stream. The bytes
 *    between `stream`/`endstream` after a `/FlateDecode` filter are a plain
 *    zlib stream. Text is printed as embedded-font glyph numbers (`<...> TJ`),
 *    not letters, and each font's own `/ToUnicode` map says which letter each
 *    number is — both are decoded below.
 *  - DOCX: a plain ZIP. `word/document.xml` holds the text, deflated per
 *    ZIP's own (raw, headerless) format — a few dozen lines of manual local
 *    file-header parsing, not worth a dependency for one test file.
 */

/** Every Flate stream in the file, inflated, keyed by the object that holds it. */
function pdfStreams(buffer: Buffer): Map<string, string> {
  const raw = buffer.toString('latin1');
  const streams = new Map<string, string>();
  let from = 0;
  for (;;) {
    const filterIdx = raw.indexOf('/FlateDecode', from);
    if (filterIdx === -1) break;
    const objIdx = raw.lastIndexOf(' 0 obj', filterIdx);
    const id = /\d+$/.exec(raw.slice(objIdx - 10, objIdx))?.[0] ?? '';
    const streamIdx = raw.indexOf('stream', filterIdx) + 'stream'.length;
    let start = streamIdx;
    while (raw[start] === '\r' || raw[start] === '\n') start++;
    const end = raw.indexOf('endstream', start);
    const inflated = zlib.inflateSync(buffer.subarray(start, end));
    streams.set(id, inflated.toString('latin1'));
    from = end + 'endstream'.length;
  }
  return streams;
}

const hasText = (content: string) => /\/F\d+ [\d.]+ Tf/.test(content);

function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const streams = pdfStreams(buffer);

  // Font resource name (`F1`) → glyph number → the text it prints.
  const fonts = new Map<string, Map<number, string>>();
  for (const [, name, fontId] of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const toUnicode = new RegExp(
      `\\b${fontId} 0 obj[^]*?/ToUnicode (\\d+) 0 R`,
    ).exec(raw)?.[1];
    const glyphs = new Map<number, string>();
    for (const [, first, list] of (streams.get(toUnicode ?? '') ?? '').matchAll(
      /<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/gi,
    )) {
      [...list.matchAll(/<([0-9a-f]+)>/gi)].forEach(([, hex], i) => {
        const text = Buffer.from(hex, 'hex').swap16().toString('utf16le');
        glyphs.set(parseInt(first, 16) + i, text);
      });
    }
    fonts.set(name, glyphs);
  }

  const printed: string[] = [];
  for (const content of streams.values()) {
    if (!hasText(content)) continue;
    let glyphs: Map<number, string> | undefined;
    for (const [, font, hex] of content.matchAll(
      /\/(F\d+) [\d.]+ Tf|<([0-9a-f]+)>/gi,
    )) {
      if (font) glyphs = fonts.get(font);
      else
        for (const [code] of hex.matchAll(/.{4}/g)) {
          printed.push(glyphs?.get(parseInt(code, 16)) ?? '');
        }
    }
  }
  return printed.join('');
}

function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break; // local file header
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === entryName) {
      const data = buffer.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
    }
    offset = dataStart + compSize;
  }
  return null;
}

function docxText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, 'word/document.xml');
  return xml ? xml.toString('utf8') : '';
}

const search = { search: jest.fn(() => ['q-1']) };

describe('QuestionExportService', () => {
  const INSTITUTE = 'inst-1';
  const Q1 = {
    id: 'q-1',
    statement: 'What is the powerhouse of the cell?',
    options: [
      { key: 'A', text: 'Nucleus' },
      { key: 'B', text: 'Mitochondrion' },
    ],
    answerKey: 'B',
    explanation: 'SECRETEXPLANATIONTEXT',
    type: 'MCQ',
    mediaKeys: [] as string[],
    subject: 'Biology',
    chapter: 'Cell Structure',
    topic: null,
    difficulty: 'EASY',
    marks: 4,
    negativeMarks: 1,
  };
  const Q2 = {
    ...Q1,
    id: 'q-2',
    statement: 'Second question statement',
    answerKey: 'A',
    explanation: 'SECONDEXPLANATION',
  };

  function build(rows = [Q1, Q2]) {
    const prisma = {
      question: {
        findMany: jest.fn(() => rows),
        count: jest.fn(() => rows.length),
      },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u-1' })),
    };
    const service = new QuestionExportService(
      prisma as never,
      tenant as never,
      {} as never,
      search as never,
    );
    return { service, prisma };
  }

  describe('answer leakage', () => {
    it('PDF: includes the correct answer and explanation when asked for', async () => {
      const { service } = build([Q1]);
      const { buffer } = await service.export(
        ['q-1'],
        undefined,
        ExportFormat.PDF,
        true,
      );
      const text = pdfText(buffer);
      expect(text).toContain('Answer: B');
      expect(text).toContain('SECRETEXPLANATIONTEXT');
    });

    it('PDF: "Questions Only" never contains the answer key or explanation', async () => {
      const { service } = build([Q1]);
      const { buffer } = await service.export(
        ['q-1'],
        undefined,
        ExportFormat.PDF,
        false,
      );
      const text = pdfText(buffer);
      expect(text).not.toContain('SECRETEXPLANATIONTEXT');
      expect(text).not.toContain('Answer: B');
      // The question itself must still be there — this is an export, not an
      // empty file.
      expect(text).toContain('powerhouse');
    });

    it('DOCX: includes the correct answer and explanation when asked for', async () => {
      const { service } = build([Q1]);
      const { buffer } = await service.export(
        ['q-1'],
        undefined,
        ExportFormat.DOCX,
        true,
      );
      const text = docxText(buffer);
      expect(text).toContain('Answer: B');
      expect(text).toContain('SECRETEXPLANATIONTEXT');
    });

    it('DOCX: "Questions Only" never contains the answer key or explanation', async () => {
      const { service } = build([Q1]);
      const { buffer } = await service.export(
        ['q-1'],
        undefined,
        ExportFormat.DOCX,
        false,
      );
      const text = docxText(buffer);
      expect(text).not.toContain('SECRETEXPLANATIONTEXT');
      expect(text).not.toContain('Answer: B');
      expect(text).toContain('powerhouse');
    });
  });

  describe('selection', () => {
    it('exports exactly the ticked ids, in tick order — not database order', async () => {
      const { service, prisma } = build([Q1, Q2]);
      // The DB returns them reversed; the export must still follow `ids`.
      (prisma.question.findMany as jest.Mock).mockReturnValueOnce([Q2, Q1]);
      const { buffer } = await service.export(
        ['q-1', 'q-2'],
        undefined,
        ExportFormat.DOCX,
        false,
      );
      const text = docxText(buffer);
      expect(text.indexOf('powerhouse')).toBeLessThan(
        text.indexOf('Second question'),
      );
    });

    it('refuses ids that do not all exist in this institute', async () => {
      const { service, prisma } = build([Q1]); // only one of the two comes back
      (prisma.question.findMany as jest.Mock).mockReturnValueOnce([Q1]);
      await expect(
        service.export(
          ['q-1', 'q-missing'],
          undefined,
          ExportFormat.PDF,
          false,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('filters mode searches the way the list does, not the raw column', async () => {
      const { service, prisma } = build();
      await service.export(
        undefined,
        { search: 'CO2' },
        ExportFormat.PDF,
        false,
      );
      expect(search.search).toHaveBeenCalledWith(
        expect.objectContaining({ instituteId: INSTITUTE, term: 'CO2' }),
      );
      expect(prisma.question.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: { in: ['q-1'] } }),
      });
    });

    it('filters mode refuses when nothing matches', async () => {
      const { service, prisma } = build([]);
      (prisma.question.count as jest.Mock).mockReturnValueOnce(0);
      await expect(
        service.export(
          undefined,
          { subjectId: 'none' },
          ExportFormat.PDF,
          false,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('filters mode refuses a selection larger than the export cap', async () => {
      const { service, prisma } = build([]);
      (prisma.question.count as jest.Mock).mockReturnValueOnce(501);
      await expect(
        service.export(undefined, {}, ExportFormat.PDF, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('a manual tick-list beyond the cap is refused before any query runs', async () => {
      const { service } = build([]);
      const ids = Array.from({ length: 501 }, (_, i) => `q-${i}`);
      await expect(
        service.export(ids, undefined, ExportFormat.PDF, false),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

/**
 * Images in the exported paper: stem diagrams and option images are embedded
 * when the storage port can serve them, and degrade to "[image]" when not.
 */
describe('QuestionExportService - embedded images', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  const withImages = {
    id: 'q-img',
    statement: 'Which waveform is shown?',
    options: [
      { key: 'A', text: 'sine wave' },
      { key: 'B', text: '', mediaKey: 'inst-1/opt-b.png' },
      { key: 'C', text: 'a drawing', mediaKey: 'inst-1/opt-c.svg' },
      { key: 'D', text: '', mediaKey: 'inst-1/opt-gone.png' },
    ],
    answerKey: 'B',
    explanation: null,
    type: 'MCQ',
    mediaKeys: ['inst-1/stem.png'],
    subject: 'Physics',
    chapter: 'Waves',
    topic: null,
    difficulty: 'EASY',
    marks: 4,
    negativeMarks: 1,
  };

  function build(files: Record<string, Buffer | Error | null>) {
    const prisma = {
      question: {
        findMany: jest.fn(() => [withImages]),
        count: jest.fn(() => 1),
      },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: 'inst-1', userId: 'u-1' })),
    };
    const storage = {
      get: jest.fn((key: string) => {
        const f = files[key];
        if (f instanceof Error) return Promise.reject(f);
        return Promise.resolve(f ?? null);
      }),
    };
    const service = new QuestionExportService(
      prisma as never,
      tenant as never,
      storage as never,
      search as never,
    );
    return { service, prisma, storage };
  }

  const files = {
    'inst-1/stem.png': PNG,
    'inst-1/opt-b.png': PNG,
    'inst-1/opt-c.svg': SVG,
    'inst-1/opt-gone.png': null,
  };

  it('asks the database for stem and option image keys', async () => {
    const { service, prisma } = build(files);
    await service.export(['q-img'], undefined, ExportFormat.PDF, false);
    const call = prisma.question.findMany.mock.calls[0] as unknown as [
      { select: { mediaKeys: boolean; options: boolean } },
    ];
    expect(call[0].select).toMatchObject({ mediaKeys: true, options: true });
  });

  it('PDF: embeds readable images and prints [image] for the rest', async () => {
    const { service, storage } = build(files);
    const { buffer } = await service.export(
      ['q-img'],
      undefined,
      ExportFormat.PDF,
      false,
    );
    // The stem diagram and option B are drawn (an RGBA PNG is two image
    // objects in PDF: the picture and its alpha mask); the others are not.
    const drawn = buffer.toString('latin1').match(/\/Subtype \/Image/g) ?? [];
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    expect(drawn.length % 2).toBe(0);
    expect(storage.get).toHaveBeenCalledTimes(4);

    const text = pdfText(buffer);
    expect(text).toContain('A) sine wave');
    // B is drawn: just the label. C (SVG) and D (missing) fall back.
    expect(text).toContain('C) a drawing [image]');
    expect(text).toContain('D) [image]');
    expect(text).not.toContain('B) [image]');
  });

  it('DOCX: embeds readable images and prints [image] for the rest', async () => {
    const { service } = build(files);
    const { buffer } = await service.export(
      ['q-img'],
      undefined,
      ExportFormat.DOCX,
      false,
    );
    expect(buffer.toString('latin1')).toContain('word/media/');
    const xml = docxText(buffer);
    expect(xml).toContain('A) sine wave');
    expect(xml).toContain('C) a drawing [image]');
    expect(xml).toContain('D) [image]');
    expect(xml).not.toContain('B) [image]');
    // Exactly the stem diagram and option B.
    expect(xml.match(/<w:drawing>/g)).toHaveLength(2);
  });

  it('prints placeholders and still finishes when storage throws or is empty', async () => {
    const { service } = build({
      'inst-1/stem.png': new Error('S3 unavailable'),
      'inst-1/opt-b.png': null,
      'inst-1/opt-c.svg': SVG,
      'inst-1/opt-gone.png': null,
    });
    const pdf = await service.export(
      ['q-img'],
      undefined,
      ExportFormat.PDF,
      false,
    );
    expect(pdf.buffer.toString('latin1')).not.toContain('/Subtype /Image');
    const text = pdfText(pdf.buffer);
    expect(text).toContain('B) [image]');
    expect(text).toContain('D) [image]');

    const docx = await service.export(
      ['q-img'],
      undefined,
      ExportFormat.DOCX,
      true,
    );
    expect(docxText(docx.buffer)).toContain('B) [image]');
  });

  it('PDF cannot draw a GIF, DOCX can: the GIF falls back only in the PDF', async () => {
    const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
    const only = {
      'inst-1/stem.png': GIF,
      'inst-1/opt-b.png': GIF,
      'inst-1/opt-c.svg': GIF,
      'inst-1/opt-gone.png': GIF,
    };
    const { service } = build(only);
    const pdf = await service.export(
      ['q-img'],
      undefined,
      ExportFormat.PDF,
      false,
    );
    expect(pdf.buffer.toString('latin1')).not.toContain('/Subtype /Image');
    const docx = await service.export(
      ['q-img'],
      undefined,
      ExportFormat.DOCX,
      false,
    );
    expect(docxText(docx.buffer)).toContain('<w:drawing>');
  });
});

/** Stored text is HTML; neither output format may print it as tags or entities. */
describe('QuestionExportService - formatted text', () => {
  const FORMATTED = {
    id: 'q-fmt',
    statement:
      '<strong>Bold</strong> <em>slanted</em> <u>lined</u> CO<sub>2</sub> x<sup>2</sup> Fe &amp; Cu<br>next line',
    options: [
      { key: 'A', text: 'H<sub>2</sub>O' },
      { key: 'B', text: 'a &lt; b' },
    ],
    answerKey: 'A',
    explanation: '<strong>Because</strong> H<sub>2</sub>',
    type: 'MCQ',
    mediaKeys: [] as string[],
    subject: 'Chemistry',
    chapter: 'Gases',
    topic: null,
    difficulty: 'EASY',
    marks: 4,
    negativeMarks: 1,
  };

  function build(statement = FORMATTED.statement) {
    const prisma = {
      question: {
        findMany: jest.fn(() => [{ ...FORMATTED, statement }]),
        count: jest.fn(() => 1),
      },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: 'inst-1', userId: 'u-1' })),
    };
    return new QuestionExportService(
      prisma as never,
      tenant as never,
      {} as never,
      search as never,
    );
  }

  it('DOCX: carries each mark as real Word formatting', async () => {
    const { buffer } = await build().export(
      ['q-fmt'],
      undefined,
      ExportFormat.DOCX,
      true,
    );
    const xml = docxText(buffer);
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('<w:u ');
    expect(xml).toContain('w:val="subscript"');
    expect(xml).toContain('w:val="superscript"');
    expect(xml).toContain('<w:br/>');
    expect(xml).toContain('Fe &amp; Cu');
    expect(xml).toContain('a &lt; b');
    expect(xml).not.toContain('&lt;sub&gt;');
    expect(xml).not.toContain('&amp;amp;');
  });

  it('PDF: prints the words without tags or entities', async () => {
    const { buffer } = await build().export(
      ['q-fmt'],
      undefined,
      ExportFormat.PDF,
      true,
    );
    const text = pdfText(buffer);
    expect(text).toContain('Fe & Cu');
    expect(text).toContain('A) H2O');
    expect(text).toContain('B) a < b');
    expect(text).toContain('Explanation: Because H2');
    expect(text).not.toContain('<sub>');
    expect(text).not.toContain('&amp;');
  });

  it('PDF: prints Greek and maths symbols as themselves', async () => {
    const { buffer } = await build('Find α ≥ β, Δ ± √2 → ∞').export(
      ['q-fmt'],
      undefined,
      ExportFormat.PDF,
      false,
    );
    expect(pdfText(buffer)).toContain('Find α ≥ β, Δ ± √2 → ∞');
    expect(pdfText(buffer)).toContain('+4/−1');
    expect(buffer.toString('latin1')).toContain('+DejaVuSans');
    expect(buffer.toString('latin1')).not.toContain('Helvetica');
  });

  it('PDF: carries each mark in its own font', async () => {
    const { buffer } = await build(
      '<strong>Bold</strong> <em>slanted</em> <strong><em>both</em></strong> CO<sub>2</sub> x<sup>2</sup>',
    ).export(['q-fmt'], undefined, ExportFormat.PDF, false);
    const raw = buffer.toString('latin1');
    expect(raw).toContain('+DejaVuSans-Bold\n');
    expect(raw).toContain('+DejaVuSans-Oblique\n');
    expect(raw).toContain('+DejaVuSans-BoldOblique\n');
    expect(pdfText(buffer)).toContain('Bold slanted both CO2 x2');
  });

  it('PDF: a line break starts again at the left margin', async () => {
    const { buffer } = await build(
      'first <strong>line</strong><br>second <strong>line</strong>',
    ).export(['q-fmt'], undefined, ExportFormat.PDF, false);
    const content = [...pdfStreams(buffer).values()].find(hasText) ?? '';
    const leftEdge = new Map<number, number>();
    for (const [, x, y] of content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)) {
      const left = leftEdge.get(Number(y)) ?? Infinity;
      leftEdge.set(Number(y), Math.min(left, Number(x)));
    }
    // Top of the page first: the title, then the two lines of the statement.
    const [, firstLine, secondLine] = [...leftEdge.keys()].sort(
      (a, b) => b - a,
    );
    expect(leftEdge.get(firstLine)).toBe(50);
    expect(leftEdge.get(secondLine)).toBe(50);
  });

  it('PDF: still ends the line when there is no text to print', async () => {
    const { buffer } = await build('').export(
      ['q-fmt'],
      undefined,
      ExportFormat.PDF,
      false,
    );
    expect(pdfText(buffer)).toContain('Q1.');
    expect(pdfText(buffer)).toContain('A) H2O');
  });
});
