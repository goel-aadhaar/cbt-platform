import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { ExportFilterDto, ExportFormat } from './dto/export-questions.dto';

/** Same rows the on-screen bank shows, plus everything needed to typeset a
 * real question paper. */
const exportSelect = {
  id: true,
  statement: true,
  options: true,
  answerKey: true,
  explanation: true,
  type: true,
  subject: true,
  chapter: true,
  topic: true,
  difficulty: true,
  marks: true,
  negativeMarks: true,
} satisfies Prisma.QuestionSelect;

type ExportRow = Prisma.QuestionGetPayload<{ select: typeof exportSelect }>;

/**
 * A safety cap, not a product limit: a "paper" of more than this many
 * questions is not something anyone actually prints, and generating it would
 * mean building a multi-thousand-page PDF in memory on every request. The
 * Question Bank itself stays uncapped (§2.4's 20,000+ per institute) — only
 * a single export's SELECTION is bounded.
 */
const MAX_EXPORT_QUESTIONS = 500;

@Injectable()
export class QuestionExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { instituteId: ctx.instituteId, userId: ctx.userId };
  }

  /**
   * Resolves the export request to real rows — a manual tick-list (`ids`,
   * order preserved) or "everything currently filtered" — with NO artificial
   * restriction beyond the safety cap above and normal tenant scoping.
   */
  private async resolveQuestions(
    ids: string[] | undefined,
    filters: ExportFilterDto | undefined,
  ): Promise<ExportRow[]> {
    const { instituteId, userId } = this.ctx();

    if (ids && ids.length > 0) {
      if (ids.length > MAX_EXPORT_QUESTIONS) {
        throw new BadRequestException(
          `Select at most ${MAX_EXPORT_QUESTIONS} questions per export — you selected ${ids.length}.`,
        );
      }
      const rows = await this.prisma.question.findMany({
        where: { id: { in: ids }, instituteId },
        select: exportSelect,
      });
      if (rows.length !== ids.length) {
        throw new BadRequestException(
          'One or more of the selected questions could not be found in your institute.',
        );
      }
      // Preserve the order the caller ticked them in, not the DB's return order.
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)!);
    }

    const where: Prisma.QuestionWhereInput = {
      instituteId,
      ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters?.chapterId ? { chapterId: filters.chapterId } : {}),
      ...(filters?.topicId ? { topicId: filters.topicId } : {}),
      ...(filters?.difficulty ? { difficulty: filters.difficulty } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.examCategoryId
        ? { examCategoryId: filters.examCategoryId }
        : {}),
      ...(filters?.tag ? { tags: { has: filters.tag } } : {}),
      ...(filters?.mine ? { createdById: userId } : {}),
      ...(filters?.search
        ? { statement: { contains: filters.search, mode: 'insensitive' } }
        : {}),
    };

    const total = await this.prisma.question.count({ where });
    if (total === 0) {
      throw new BadRequestException('No questions match this export.');
    }
    if (total > MAX_EXPORT_QUESTIONS) {
      throw new BadRequestException(
        `${total} questions match these filters — narrow them or tick specific questions. ` +
          `A single export is capped at ${MAX_EXPORT_QUESTIONS}.`,
      );
    }

    return this.prisma.question.findMany({
      where,
      select: exportSelect,
      orderBy: [{ subject: 'asc' }, { chapter: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async export(
    ids: string[] | undefined,
    filters: ExportFilterDto | undefined,
    format: ExportFormat,
    includeAnswers: boolean,
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const rows = await this.resolveQuestions(ids, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const scope =
      rows.length === 1
        ? rows[0].subject
        : new Set(rows.map((r) => r.subject)).size === 1
          ? rows[0].subject
          : 'question-bank';
    const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const suffix = includeAnswers ? 'with-answers' : 'questions-only';

    if (format === ExportFormat.DOCX) {
      const buffer = await this.buildDocx(rows, includeAnswers);
      return {
        filename: `${slug}-${suffix}-${stamp}.docx`,
        buffer,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    const buffer = await this.buildPdf(rows, includeAnswers);
    return {
      filename: `${slug}-${suffix}-${stamp}.pdf`,
      buffer,
      mimeType: 'application/pdf',
    };
  }

  /** "A) text" / "B) text" …, or the raw options for a type without keys. */
  private optionLines(row: ExportRow): string[] {
    const options = row.options as { key: string; text: string }[] | null;
    if (!options) return [];
    return options.map((o) => `${o.key}) ${o.text}`);
  }

  /** Correct-answer line, formatted for whichever question type this is. */
  private answerLine(row: ExportRow): string {
    const key = row.answerKey;
    if (Array.isArray(key)) return `Answer: ${key.join(', ')}`;
    if (typeof key === 'string' || typeof key === 'number') {
      return `Answer: ${key}`;
    }
    // MCQ is a string key, MSQ an array (handled above), INTEGER a number —
    // every real answerKey lands in one of those. This is only reachable if
    // a row's JSON shape is corrupt, which is worth flagging rather than
    // silently printing "[object Object]" into an exported paper.
    return 'Answer: (unrecognised answer format)';
  }

  private buildPdf(
    rows: ExportRow[],
    includeAnswers: boolean,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(includeAnswers ? 'Question Set — With Answers' : 'Question Set', {
        align: 'center',
      });
    doc.moveDown(1);

    rows.forEach((row, i) => {
      if (doc.y > doc.page.height - 150) doc.addPage();

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`Q${i + 1}. `, { continued: true })
        .font('Helvetica')
        .text(row.statement);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(
          `${row.subject} › ${row.chapter}${row.topic ? ` › ${row.topic}` : ''} · ${row.difficulty} · +${row.marks}/−${row.negativeMarks}`,
        )
        .fillColor('#000000');
      doc.moveDown(0.3);

      for (const line of this.optionLines(row)) {
        doc.fontSize(10).text(line, { indent: 15 });
      }

      if (includeAnswers) {
        doc.moveDown(0.2);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#1a7a3c')
          .text(this.answerLine(row))
          .fillColor('#000000')
          .font('Helvetica');
        if (row.explanation) {
          doc.fontSize(9).text(`Explanation: ${row.explanation}`);
        }
      }
      doc.moveDown(1);
    });

    doc.end();
    return done;
  }

  private async buildDocx(
    rows: ExportRow[],
    includeAnswers: boolean,
  ): Promise<Buffer> {
    const children: Paragraph[] = [
      new Paragraph({
        text: includeAnswers ? 'Question Set — With Answers' : 'Question Set',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
    ];

    rows.forEach((row, i) => {
      children.push(
        new Paragraph({
          spacing: { before: 240 },
          children: [
            new TextRun({ text: `Q${i + 1}. `, bold: true }),
            new TextRun({ text: row.statement }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `${row.subject} › ${row.chapter}${row.topic ? ` › ${row.topic}` : ''} · ${row.difficulty} · +${row.marks}/−${row.negativeMarks}`,
              size: 18,
              color: '666666',
              italics: true,
            }),
          ],
        }),
      );

      for (const line of this.optionLines(row)) {
        children.push(new Paragraph({ text: line, indent: { left: 360 } }));
      }

      if (includeAnswers) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: this.answerLine(row),
                bold: true,
                color: '1A7A3C',
              }),
            ],
          }),
        );
        if (row.explanation) {
          children.push(
            new Paragraph({ text: `Explanation: ${row.explanation}` }),
          );
        }
      }
    });

    const doc = new Document({ sections: [{ children }] });
    return Packer.toBuffer(doc);
  }
}
