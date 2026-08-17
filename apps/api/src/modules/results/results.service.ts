import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ExamQuestionScoring,
  QuestionType,
  ResultPolicy,
} from '../../generated/prisma/enums';
import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';

import { Prisma } from '../../generated/prisma/client';
import { toCsv, withBom } from '../../common/csv/to-csv';
import type { CsvCell } from '../../common/csv/to-csv';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { SetManualScoreDto } from './dto/set-manual-score.dto';
import {
  assignCompetitionRanks,
  isCorrect,
  percentilesByScore,
} from './scoring';

interface SectionScore {
  sectionId: string;
  name: string;
  score: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  /** Time the candidate spent in this section (§2.8 historical record). */
  seconds: number;
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

  async evaluate(
    examId: string,
    opts: {
      /**
       * Keep each existing row's `published` flag instead of re-deriving it
       * from the result policy. Used by answer-key corrections (§2.9): a bonus
       * or dropped question must update the scores students can already see,
       * not yank their results back into review.
       */
      preservePublished?: boolean;
    } = {},
  ) {
    const instituteId = this.instituteId();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: {
        id: true,
        resultPolicy: true,
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

    // Manual-evaluation awards (§2.5), keyed by attempt+question.
    const manualRows = await this.prisma.manualScore.findMany({
      where: { examId, instituteId },
      select: { attemptId: true, questionId: true, marks: true },
    });
    const manualByKey = new Map(
      manualRows.map((m) => [`${m.attemptId}:${m.questionId}`, m.marks]),
    );

    // Time spent per section (§2.8), keyed by attempt+section.
    const timeRows = await this.prisma.attemptSectionTime.findMany({
      where: { attempt: { examId }, instituteId },
      select: { attemptId: true, sectionId: true, seconds: true },
    });
    const secondsByKey = new Map(
      timeRows.map((t) => [`${t.attemptId}:${t.sectionId}`, t.seconds]),
    );

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
            seconds: secondsByKey.get(`${att.id}:${m.sectionId}`) ?? 0,
          } satisfies SectionScore);

        if (m.override === ExamQuestionScoring.BONUS) {
          // Full marks to everyone regardless of their answer.
          correctCount++;
          sec.correct++;
          totalScore += m.marksCorrect;
          sec.score += m.marksCorrect;
        } else if (m.override === ExamQuestionScoring.MANUAL) {
          // Manual evaluation (§2.5): the admin's award replaces auto-scoring.
          const awarded = manualByKey.get(`${att.id}:${questionId}`) ?? 0;
          const answer = answers.get(questionId);
          totalScore += awarded;
          sec.score += awarded;
          if (awarded > 0) {
            correctCount++;
            sec.correct++;
          } else if (answer === null || answer === undefined) {
            unattemptedCount++;
            sec.unattempted++;
          } else {
            incorrectCount++;
            sec.incorrect++;
          }
        } else {
          const answer = answers.get(questionId);
          if (answer === null || answer === undefined) {
            unattemptedCount++;
            sec.unattempted++;
          } else if (isCorrect(m.type, answer, m.answerKey)) {
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
    //
    // Computed by sorting rather than by rescanning the cohort for every
    // candidate: the previous shape ran three O(n) filters per candidate, i.e.
    // O(n²), which is ~75M comparisons for a 5,000-candidate exam.
    const n = scored.length;
    assignCompetitionRanks(scored, (s, rank) => {
      s.overallRank = rank;
    });

    const byBatch = new Map<string, ScoredAttempt[]>();
    for (const s of scored) {
      const group = byBatch.get(s.batchId);
      if (group) group.push(s);
      else byBatch.set(s.batchId, [s]);
    }
    for (const group of byBatch.values()) {
      assignCompetitionRanks(group, (s, rank) => {
        s.batchRank = rank;
      });
    }

    const percentiles = percentilesByScore(scored.map((s) => s.totalScore));
    for (const s of scored) {
      s.percentile = percentiles.get(s.totalScore) ?? 0;
    }

    // Result visibility (§2.2/§2.8): IMMEDIATE publishes on evaluation; the
    // held policies (ON_PUBLISH / BATCH_WISE) stay hidden until an admin
    // publishes (all at once, or batch-by-batch for BATCH_WISE).
    const autoPublish = exam.resultPolicy === ResultPolicy.IMMEDIATE;

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
            published: autoPublish,
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
            // IMMEDIATE stays visible on re-evaluation; held policies re-hide
            // until an admin reviews + republishes — unless this is an answer-key
            // correction, which must leave visibility exactly as it was.
            ...(opts.preservePublished ? {} : { published: autoPublish }),
          },
        }),
      ),
    );

    return { evaluated: n, maxScore, autoPublished: autoPublish };
  }

  /**
   * Flag a question for grace-marks handling (§2.9): BONUS awards full marks to
   * every candidate, DROPPED removes it from scoring, NORMAL reverts. The caller
   * re-runs {@link evaluate} (idempotent) and re-publishes to apply the change.
   */
  /**
   * The exam's questions with their current answer-key decision (§2.9), plus
   * how many candidates got each one right. The hit rate is what tells an
   * admin whether a question is worth dropping — a near-zero rate on a
   * question everyone attempted usually means the key is wrong.
   */
  async listQuestionScoring(examId: string) {
    const instituteId = this.instituteId();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: { id: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const [rows, attempts] = await Promise.all([
      this.prisma.examQuestion.findMany({
        where: { examId, instituteId },
        orderBy: [{ sectionId: 'asc' }, { order: 'asc' }],
        select: {
          questionId: true,
          order: true,
          scoring: true,
          section: { select: { name: true } },
          question: {
            select: {
              id: true,
              statement: true,
              type: true,
              marks: true,
              answerKey: true,
            },
          },
        },
      }),
      this.prisma.attempt.findMany({
        where: {
          examId,
          instituteId,
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        },
        select: { responses: { select: { questionId: true, answer: true } } },
      }),
    ]);

    const stats = new Map<string, { attempted: number; correct: number }>();
    for (const a of attempts) {
      for (const r of a.responses) {
        const cur = stats.get(r.questionId) ?? { attempted: 0, correct: 0 };
        if (r.answer !== null) cur.attempted += 1;
        stats.set(r.questionId, cur);
      }
    }
    for (const row of rows) {
      const cur = stats.get(row.questionId);
      if (!cur) continue;
      for (const a of attempts) {
        const r = a.responses.find((x) => x.questionId === row.questionId);
        if (
          r?.answer != null &&
          isCorrect(row.question.type, r.answer, row.question.answerKey)
        ) {
          cur.correct += 1;
        }
      }
    }

    return {
      candidates: attempts.length,
      items: rows.map((r) => {
        const st = stats.get(r.questionId) ?? { attempted: 0, correct: 0 };
        return {
          questionId: r.questionId,
          order: r.order,
          section: r.section?.name ?? null,
          statement: r.question.statement,
          type: r.question.type,
          marks: r.question.marks,
          scoring: r.scoring,
          attempted: st.attempted,
          correct: st.correct,
          /** Share of candidates who ANSWERED it that got it right, 0-100. */
          hitRate:
            st.attempted === 0
              ? null
              : Math.round((st.correct / st.attempted) * 100),
        };
      }),
    };
  }

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

    /**
     * §2.9 requires scores, ranks and percentiles to update "without manual
     * correction", so the recalculation runs here rather than waiting for an
     * admin to press Evaluate. Only meaningful once results exist; publication
     * state is preserved so a correction never hides results students can see.
     */
    const alreadyEvaluated = await this.prisma.result.count({
      where: { examId, instituteId },
    });
    const recalculated =
      alreadyEvaluated > 0
        ? await this.evaluate(examId, { preservePublished: true })
        : null;

    return { examId, questionId, scoring: override, recalculated };
  }

  /**
   * Award manual marks to one candidate for one question (§2.5). Used after a
   * question is remediated with MANUAL evaluation; re-run {@link evaluate} to
   * fold the awards into scores and ranks.
   */
  async setManualScore(examId: string, dto: SetManualScoreDto) {
    const instituteId = this.instituteId();
    const examQuestion = await this.prisma.examQuestion.findFirst({
      where: { examId, questionId: dto.questionId, instituteId },
      select: { scoring: true },
    });
    if (!examQuestion) {
      throw new NotFoundException('Question is not part of this exam');
    }
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: dto.attemptId, examId, instituteId },
      select: { id: true },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt is not part of this exam');
    }

    const saved = await this.prisma.manualScore.upsert({
      where: {
        attemptId_questionId: {
          attemptId: dto.attemptId,
          questionId: dto.questionId,
        },
      },
      create: {
        examId,
        instituteId,
        attemptId: dto.attemptId,
        questionId: dto.questionId,
        marks: dto.marks,
      },
      update: { marks: dto.marks },
      select: { attemptId: true, questionId: true, marks: true },
    });
    return { ...saved, scoring: examQuestion.scoring };
  }

  /** Publish results (§2.8). Pass `batchId` to release one batch (BATCH_WISE). */
  async publish(examId: string, batchId?: string) {
    await this.requireExam(examId);
    const res = await this.prisma.result.updateMany({
      where: {
        examId,
        instituteId: this.instituteId(),
        ...(batchId ? { batchId } : {}),
      },
      data: { published: true },
    });
    return { published: res.count, ...(batchId ? { batchId } : {}) };
  }

  /** Hold (unpublish) results. Pass `batchId` to hold just one batch. */
  async hold(examId: string, batchId?: string) {
    await this.requireExam(examId);
    const res = await this.prisma.result.updateMany({
      where: {
        examId,
        instituteId: this.instituteId(),
        ...(batchId ? { batchId } : {}),
      },
      data: { published: false },
    });
    return { held: res.count, ...(batchId ? { batchId } : {}) };
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
        attempt: { select: { flagged: true, violationCount: true } },
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

  /**
   * Per-question review of a candidate's own attempt (§2.8).
   *
   * Only once the result is published: this is the one payload that carries
   * answer keys to a student, so it must never be reachable while an exam is
   * still being sat or held back for review.
   *
   * Scoring mirrors `evaluate` exactly — including BONUS, DROPPED and MANUAL
   * overrides (§2.9) — because a review that disagreed with the score sheet
   * would be worse than no review at all.
   */
  async getReviewForStudent(attemptId: string) {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, studentId: student.id },
      select: {
        id: true,
        examId: true,
        submittedAt: true,
        responses: { select: { questionId: true, answer: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const result = await this.prisma.result.findFirst({
      where: { attemptId, studentId: student.id, published: true },
      select: {
        totalScore: true,
        maxScore: true,
        correctCount: true,
        incorrectCount: true,
        unattemptedCount: true,
        overallRank: true,
        batchRank: true,
        percentile: true,
      },
    });
    // Withholding the key until publication is the whole point of the check.
    if (!result) throw new NotFoundException('Result not available yet');

    const exam = await this.prisma.exam.findFirst({
      where: { id: attempt.examId, instituteId: ctx.instituteId },
      select: {
        title: true,
        sections: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            marksCorrect: true,
            marksWrong: true,
            questions: {
              orderBy: { order: 'asc' },
              select: {
                order: true,
                scoring: true,
                question: {
                  select: {
                    id: true,
                    type: true,
                    statement: true,
                    options: true,
                    answerKey: true,
                    explanation: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const manual = await this.prisma.manualScore.findMany({
      where: { attemptId, instituteId: ctx.instituteId },
      select: { questionId: true, marks: true },
    });
    const manualByQuestion = new Map(
      manual.map((m) => [m.questionId, m.marks]),
    );
    const answers = new Map(
      attempt.responses.map((r) => [r.questionId, r.answer]),
    );

    let number = 0;
    const questions = exam.sections.flatMap((section) =>
      section.questions.map((eq) => {
        number += 1;
        const q = eq.question;
        const given = answers.get(q.id) ?? null;
        const attempted = given !== null && given !== undefined;

        let status:
          'CORRECT' | 'INCORRECT' | 'UNATTEMPTED' | 'DROPPED' | 'BONUS';
        let marksAwarded = 0;

        if (eq.scoring === ExamQuestionScoring.DROPPED) {
          status = 'DROPPED';
        } else if (eq.scoring === ExamQuestionScoring.BONUS) {
          status = 'BONUS';
          marksAwarded = section.marksCorrect;
        } else if (eq.scoring === ExamQuestionScoring.MANUAL) {
          marksAwarded = manualByQuestion.get(q.id) ?? 0;
          status =
            marksAwarded > 0
              ? 'CORRECT'
              : attempted
                ? 'INCORRECT'
                : 'UNATTEMPTED';
        } else if (!attempted) {
          status = 'UNATTEMPTED';
        } else if (isCorrect(q.type, given, q.answerKey)) {
          status = 'CORRECT';
          marksAwarded = section.marksCorrect;
        } else {
          status = 'INCORRECT';
          marksAwarded = -section.marksWrong;
        }

        return {
          number,
          questionId: q.id,
          section: section.name,
          type: q.type,
          statement: q.statement,
          options: q.options,
          yourAnswer: given,
          correctAnswer: q.answerKey,
          explanation: q.explanation,
          status,
          marksAwarded,
          /** What this question was worth, so a negative mark is explicable. */
          marksCorrect: section.marksCorrect,
          marksWrong: section.marksWrong,
        };
      }),
    );

    return {
      attemptId: attempt.id,
      exam: { title: exam.title },
      submittedAt: attempt.submittedAt,
      summary: {
        ...result,
        totalQuestions: questions.length,
        attempted: questions.filter((q) => q.yourAnswer !== null).length,
      },
      questions,
    };
  }

  private async requireExam(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId: this.instituteId() },
      select: { id: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }
}
