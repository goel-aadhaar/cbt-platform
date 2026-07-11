import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ExamQuestionScoring,
  QuestionType,
} from '../../generated/prisma/enums';
import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';

import { Prisma } from '../../generated/prisma/client';
import { toCsv, withBom } from '../../common/csv/to-csv';
import type { CsvCell } from '../../common/csv/to-csv';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';

interface SectionScore {
  sectionId: string;
  name: string;
  score: number;
  correct: number;
  incorrect: number;
  unattempted: number;
}

interface ScoredAttempt {
  attemptId: string;
  studentId: string;
  batchId: string;
  totalScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  sectionScores: SectionScore[];
  overallRank: number;
  batchRank: number;
  percentile: number;
}

/**
 * Results & ranking (§2.8). Evaluates every submitted attempt for an exam
 * against the (server-side) answer keys using each section's marking scheme,
 * then computes overall + batch ranks and NTA-style percentile. Results are
 * held until an admin publishes them.
 */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  async evaluate(examId: string) {
    const instituteId = this.instituteId();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: {
        id: true,
        sections: {
          select: {
            id: true,
            name: true,
            marksCorrect: true,
            marksWrong: true,
            questions: {
              select: {
                questionId: true,
                scoring: true,
                question: { select: { type: true, answerKey: true } },
              },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    // Build questionId -> marking + correct answer. DROPPED questions (§2.9)
    // are excluded from both scoring and the max marks.
    const meta = new Map<
      string,
      {
        sectionId: string;
        sectionName: string;
        marksCorrect: number;
        marksWrong: number;
        type: QuestionType;
        answerKey: Prisma.JsonValue;
        override: ExamQuestionScoring;
      }
    >();
    let maxScore = 0;
    for (const section of exam.sections) {
      for (const eq of section.questions) {
        if (eq.scoring === ExamQuestionScoring.DROPPED) continue;
        meta.set(eq.questionId, {
          sectionId: section.id,
          sectionName: section.name,
          marksCorrect: section.marksCorrect,
          marksWrong: section.marksWrong,
          type: eq.question.type,
          answerKey: eq.question.answerKey,
          override: eq.scoring,
        });
        maxScore += section.marksCorrect;
      }
    }

    const attempts = await this.prisma.attempt.findMany({
      where: {
        examId,
        instituteId,
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
      },
      select: {
        id: true,
        studentId: true,
        student: { select: { batchId: true } },
        responses: { select: { questionId: true, answer: true } },
      },
    });

    const scored: ScoredAttempt[] = attempts.map((att) => {
      let totalScore = 0;
      let correctCount = 0;
      let incorrectCount = 0;
      let unattemptedCount = 0;
      const sections = new Map<string, SectionScore>();
      const answers = new Map(
        att.responses.map((r) => [r.questionId, r.answer]),
      );

      // Iterate over every scored question in the exam — not just the ones the
      // candidate saved a response for — so unopened questions count as
      // unattempted and BONUS grace marks (§2.9) reach every candidate.
      for (const [questionId, m] of meta) {
        const sec =
          sections.get(m.sectionId) ??
          ({
            sectionId: m.sectionId,
            name: m.sectionName,
            score: 0,
            correct: 0,
            incorrect: 0,
            unattempted: 0,
          } satisfies SectionScore);

        if (m.override === ExamQuestionScoring.BONUS) {
          // Full marks to everyone regardless of their answer.
          correctCount++;
          sec.correct++;
          totalScore += m.marksCorrect;
          sec.score += m.marksCorrect;
        } else {
          const answer = answers.get(questionId);
          if (answer === null || answer === undefined) {
            unattemptedCount++;
            sec.unattempted++;
          } else if (this.isCorrect(m.type, answer, m.answerKey)) {
            correctCount++;
            sec.correct++;
            totalScore += m.marksCorrect;
            sec.score += m.marksCorrect;
          } else {
            incorrectCount++;
            sec.incorrect++;
            totalScore -= m.marksWrong;
            sec.score -= m.marksWrong;
          }
        }
        sections.set(m.sectionId, sec);
      }

      return {
        attemptId: att.id,
        studentId: att.studentId,
        batchId: att.student.batchId,
        totalScore,
        correctCount,
        incorrectCount,
        unattemptedCount,
        sectionScores: [...sections.values()],
        overallRank: 0,
        batchRank: 0,
        percentile: 0,
      };
    });

    // Ranks (competition ranking) + NTA-style percentile.
    const n = scored.length;
    for (const s of scored) {
      s.overallRank =
        1 + scored.filter((x) => x.totalScore > s.totalScore).length;
      s.batchRank =
        1 +
        scored.filter(
          (x) => x.batchId === s.batchId && x.totalScore > s.totalScore,
        ).length;
      s.percentile =
        n > 0
          ? (scored.filter((x) => x.totalScore <= s.totalScore).length / n) *
            100
          : 0;
    }

    await this.prisma.$transaction(
      scored.map((s) =>
        this.prisma.result.upsert({
          where: { attemptId: s.attemptId },
          create: {
            instituteId,
            examId,
            attemptId: s.attemptId,
            studentId: s.studentId,
            batchId: s.batchId,
            totalScore: s.totalScore,
            maxScore,
            correctCount: s.correctCount,
            incorrectCount: s.incorrectCount,
            unattemptedCount: s.unattemptedCount,
            sectionScores: s.sectionScores as unknown as Prisma.InputJsonValue,
            overallRank: s.overallRank,
            batchRank: s.batchRank,
            percentile: s.percentile,
          },
          update: {
            totalScore: s.totalScore,
            maxScore,
            correctCount: s.correctCount,
            incorrectCount: s.incorrectCount,
            unattemptedCount: s.unattemptedCount,
            sectionScores: s.sectionScores as unknown as Prisma.InputJsonValue,
            overallRank: s.overallRank,
            batchRank: s.batchRank,
            percentile: s.percentile,
            // Re-evaluation re-holds results until an admin reviews + republishes.
            published: false,
          },
        }),
      ),
    );

    return { evaluated: n, maxScore };
  }

  /**
   * Flag a question for grace-marks handling (§2.9): BONUS awards full marks to
   * every candidate, DROPPED removes it from scoring, NORMAL reverts. The caller
   * re-runs {@link evaluate} (idempotent) and re-publishes to apply the change.
   */
  async setQuestionScoring(
    examId: string,
    questionId: string,
    override: ExamQuestionScoring,
  ) {
    const instituteId = this.instituteId();
    const eq = await this.prisma.examQuestion.findFirst({
      where: { examId, questionId, instituteId },
      select: { id: true },
    });
    if (!eq) throw new NotFoundException('Question is not part of this exam');
    await this.prisma.examQuestion.update({
      where: { id: eq.id },
      data: { scoring: override },
    });
    return { examId, questionId, scoring: override };
  }

  async publish(examId: string) {
    await this.requireExam(examId);
    const res = await this.prisma.result.updateMany({
      where: { examId, instituteId: this.instituteId() },
      data: { published: true },
    });
    return { published: res.count };
  }

  async hold(examId: string) {
    await this.requireExam(examId);
    const res = await this.prisma.result.updateMany({
      where: { examId, instituteId: this.instituteId() },
      data: { published: false },
    });
    return { held: res.count };
  }

  async listForExam(examId: string) {
    await this.requireExam(examId);
    return this.prisma.result.findMany({
      where: { examId, instituteId: this.instituteId() },
      orderBy: { overallRank: 'asc' },
      select: {
        id: true,
        totalScore: true,
        maxScore: true,
        correctCount: true,
        incorrectCount: true,
        unattemptedCount: true,
        overallRank: true,
        batchRank: true,
        percentile: true,
        published: true,
        student: {
          select: { rollNumber: true, user: { select: { name: true } } },
        },
      },
    });
  }

  /**
   * Shared ranked result-sheet data for an exam (§2.14). Admin export — includes
   * both held and published rows. Reused by the CSV / Excel / PDF exporters.
   */
  private async buildResultSheet(examId: string) {
    const instituteId = this.instituteId();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: { title: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const results = await this.prisma.result.findMany({
      where: { examId, instituteId },
      orderBy: [{ overallRank: 'asc' }, { totalScore: 'desc' }],
      select: {
        overallRank: true,
        batchRank: true,
        totalScore: true,
        maxScore: true,
        correctCount: true,
        incorrectCount: true,
        unattemptedCount: true,
        percentile: true,
        published: true,
        batch: { select: { name: true } },
        student: {
          select: {
            rollNumber: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    const headers = [
      'Rank',
      'Batch Rank',
      'Roll Number',
      'Name',
      'Email',
      'Batch',
      'Score',
      'Max Score',
      'Correct',
      'Incorrect',
      'Unattempted',
      'Percentile',
      'Status',
    ];
    const rows: CsvCell[][] = results.map((r) => [
      r.overallRank,
      r.batchRank,
      r.student.rollNumber,
      r.student.user.name,
      r.student.user.email,
      r.batch.name,
      r.totalScore,
      r.maxScore,
      r.correctCount,
      r.incorrectCount,
      r.unattemptedCount,
      r.percentile === null ? '' : r.percentile.toFixed(2),
      r.published ? 'Published' : 'Held',
    ]);

    const slug =
      exam.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'exam';
    return { title: exam.title, slug, headers, rows };
  }

  /** Ranked result sheet as CSV (§2.14). */
  async exportResultsCsv(examId: string) {
    const { slug, headers, rows } = await this.buildResultSheet(examId);
    return {
      filename: `${slug}-results.csv`,
      csv: withBom(toCsv(headers, rows)),
    };
  }

  /** Ranked result sheet as a styled Excel workbook (§2.14). */
  async exportResultsXlsx(examId: string) {
    const { title, slug, headers, rows } = await this.buildResultSheet(examId);
    const wb = new Workbook();
    wb.creator = 'DRSK CBT';
    wb.created = new Date();
    const ws = wb.addWorksheet('Results', {
      views: [{ state: 'frozen', ySplit: 2 }],
    });

    const titleRow = ws.addRow([title]);
    ws.mergeCells(1, 1, 1, headers.length);
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { horizontal: 'center' };

    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      cell.alignment = { horizontal: 'center' };
    });

    for (const row of rows) {
      ws.addRow(row);
    }

    headers.forEach((h, i) => {
      const widest = Math.max(
        h.length,
        ...rows.map((r) => String(r[i] ?? '').length),
      );
      ws.getColumn(i + 1).width = Math.min(Math.max(widest + 2, 10), 40);
    });

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { filename: `${slug}-results.xlsx`, buffer };
  }

  /** Ranked result sheet as a paginated landscape PDF (§2.14). */
  async exportResultsPdf(examId: string) {
    const { title, slug, headers, rows } = await this.buildResultSheet(examId);
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = doc.page.margins.left;
    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / headers.length;
    const rowHeight = 16;
    const bottom = doc.page.height - doc.page.margins.bottom;

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(`${title} — Result Sheet`, { align: 'center' });
    doc.moveDown(0.5);

    let y = doc.y;
    const drawRow = (cells: readonly CsvCell[], bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
      cells.forEach((c, i) => {
        doc.text(String(c ?? ''), left + i * colWidth + 2, y + 4, {
          width: colWidth - 4,
          height: rowHeight,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc
        .moveTo(left, y + rowHeight)
        .lineTo(left + usableWidth, y + rowHeight)
        .strokeColor('#cccccc')
        .stroke();
      y += rowHeight;
    };

    drawRow(headers, true);
    for (const row of rows) {
      if (y + rowHeight > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(headers, true);
      }
      drawRow(row, false);
    }

    doc.end();
    return { filename: `${slug}-results.pdf`, buffer: await done };
  }

  /** Student-facing: their own result, only once published. */
  async getForStudent(attemptId: string) {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const result = await this.prisma.result.findFirst({
      where: { attemptId, studentId: student.id, published: true },
      select: {
        totalScore: true,
        maxScore: true,
        correctCount: true,
        incorrectCount: true,
        unattemptedCount: true,
        sectionScores: true,
        overallRank: true,
        batchRank: true,
        percentile: true,
        exam: { select: { title: true } },
      },
    });
    if (!result) throw new NotFoundException('Result not available yet');
    return result;
  }

  private async requireExam(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId: this.instituteId() },
      select: { id: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  private isCorrect(
    type: QuestionType,
    answer: Prisma.JsonValue,
    key: Prisma.JsonValue,
  ): boolean {
    if (type === QuestionType.MCQ) {
      return typeof answer === 'string' && answer === key;
    }
    if (type === QuestionType.INTEGER) {
      return (
        typeof answer !== 'object' &&
        answer !== null &&
        Number(answer) === Number(key)
      );
    }
    // MSQ — set equality of option keys.
    if (!Array.isArray(answer) || !Array.isArray(key)) return false;
    const a = answer.map(String).sort();
    const k = key.map(String).sort();
    return a.length === k.length && a.every((v, i) => v === k[i]);
  }
}
