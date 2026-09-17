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
 *    zlib stream, and pdfkit's default WinAnsi font renders text as a single
 *    hex-encoded glyph string (`<...> TJ`) rather than literal ASCII — both
 *    are decoded below.
 *  - DOCX: a plain ZIP. `word/document.xml` holds the text, deflated per
 *    ZIP's own (raw, headerless) format — a few dozen lines of manual local
 *    file-header parsing, not worth a dependency for one test file.
 */

function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const filterIdx = raw.indexOf('/FlateDecode', from);
    if (filterIdx === -1) break;
    const streamIdx = raw.indexOf('stream', filterIdx) + 'stream'.length;
    let start = streamIdx;
    while (raw[start] === '\r' || raw[start] === '\n') start++;
    const end = raw.indexOf('endstream', start);
    const inflated = zlib.inflateSync(buffer.subarray(start, end));
    out.push(inflated.toString('latin1'));
    from = end + 'endstream'.length;
  }
  const content = out.join('\n');
  // Decode every hex glyph run pdfkit emits for `Tj`/`TJ` text operators.
  const decoded = [...content.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
    .join('');
  return content + decoded;
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
    const service = new QuestionExportService(prisma as never, tenant as never);
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
