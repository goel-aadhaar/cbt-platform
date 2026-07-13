import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AttemptStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { isCorrect } from '../results/scoring';
import { TenantContextService } from '../auth/tenant/tenant-context.service';

interface SectionScore {
  sectionId: string;
  name: string;
  score: number;
  correct: number;
  incorrect: number;
  unattempted: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Historical records & analytics (§2.15). Exam-level aggregates (score stats,
 * distribution, per-section averages, item analysis) and per-student exam
 * history — all derived from the Result/Attempt data.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id) {
      throw new ForbiddenException('No institute in the current context');
    }
    return id;
  }

  /** Aggregate analytics for an exam (admin). */
  async getExamAnalytics(examId: string) {
    const instituteId = this.instituteId();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: { id: true, title: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const results = await this.prisma.result.findMany({
      where: { examId, instituteId },
      select: {
        totalScore: true,
        maxScore: true,
        percentile: true,
        sectionScores: true,
      },
    });
    const n = results.length;
    const maxScore = results[0]?.maxScore ?? 0;

    const scores = results.map((r) => r.totalScore).sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);
    const median = n
      ? n % 2
        ? scores[(n - 1) / 2]
        : (scores[n / 2 - 1] + scores[n / 2]) / 2
      : 0;
    const percentileSum = results.reduce((a, r) => a + (r.percentile ?? 0), 0);

    // Score distribution: 10 bands by percentage of the max score.
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      count: 0,
    }));
    if (maxScore > 0) {
      for (const r of results) {
        const pct = Math.max(0, Math.min(100, (r.totalScore / maxScore) * 100));
        distribution[Math.min(9, Math.floor(pct / 10))].count++;
      }
    }

    // Per-section averages from the stored sectionScores breakdown.
    const sectionAgg = new Map<string, SectionScore>();
    for (const r of results) {
      const sections = (r.sectionScores as unknown as SectionScore[]) ?? [];
      for (const s of sections) {
        const cur = sectionAgg.get(s.sectionId) ?? {
          sectionId: s.sectionId,
          name: s.name,
          score: 0,
          correct: 0,
          incorrect: 0,
          unattempted: 0,
        };
        cur.score += s.score;
        cur.correct += s.correct;
        cur.incorrect += s.incorrect;
        cur.unattempted += s.unattempted;
        sectionAgg.set(s.sectionId, cur);
      }
    }
    const sections = [...sectionAgg.values()].map((s) => ({
      sectionId: s.sectionId,
      name: s.name,
      averageScore: n ? round(s.score / n) : 0,
      averageCorrect: n ? round(s.correct / n) : 0,
      averageIncorrect: n ? round(s.incorrect / n) : 0,
    }));

    return {
      examId: exam.id,
      title: exam.title,
      attempts: n,
      maxScore,
      score: {
        average: n ? round(sum / n) : 0,
        median: round(median),
        highest: n ? scores[n - 1] : 0,
        lowest: n ? scores[0] : 0,
      },
      percentileAverage: n ? round(percentileSum / n) : 0,
      distribution,
      sections,
      questions: await this.itemAnalysis(examId, instituteId),
    };
  }

  /** Per-question correctness across all evaluated attempts (item analysis). */
  private async itemAnalysis(examId: string, instituteId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: {
        sections: {
          orderBy: { order: 'asc' },
          select: {
            questions: {
              orderBy: { order: 'asc' },
              select: {
                questionId: true,
                question: {
                  select: { statement: true, type: true, answerKey: true },
                },
              },
            },
          },
        },
      },
    });
    const questions = (exam?.sections ?? []).flatMap((s) => s.questions);

    const attempts = await this.prisma.attempt.findMany({
      where: {
        examId,
        instituteId,
        status: {
          in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED],
        },
      },
      select: { responses: { select: { questionId: true, answer: true } } },
    });
    const answerMaps = attempts.map(
      (a) => new Map(a.responses.map((r) => [r.questionId, r.answer])),
    );

    return questions.map((q) => {
      let correct = 0;
      let incorrect = 0;
      let unattempted = 0;
      for (const answers of answerMaps) {
        const answer = answers.get(q.questionId);
        if (answer === null || answer === undefined) unattempted++;
        else if (isCorrect(q.question.type, answer, q.question.answerKey))
          correct++;
        else incorrect++;
      }
      const attempted = correct + incorrect;
      return {
        questionId: q.questionId,
        statement: q.question.statement.slice(0, 100),
        type: q.question.type,
        correct,
        incorrect,
        unattempted,
        correctPct: attempted ? round((correct / attempted) * 100) : 0,
      };
    });
  }

  /** A student's exam history (admin) — held and published results. */
  async getStudentHistory(studentId: string) {
    const instituteId = this.instituteId();
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId },
      select: {
        id: true,
        rollNumber: true,
        user: { select: { name: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const results = await this.prisma.result.findMany({
      where: { studentId, instituteId },
      orderBy: { createdAt: 'desc' },
      select: this.historySelect,
    });
    return {
      student: {
        id: student.id,
        rollNumber: student.rollNumber,
        name: student.user.name,
      },
      results,
    };
  }

  /** The calling student's own published exam history. */
  async getMyHistory() {
    const ctx = this.tenant.get();
    if (!ctx?.userId) {
      throw new ForbiddenException('No user in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    return this.prisma.result.findMany({
      where: { studentId: student.id, published: true },
      orderBy: { createdAt: 'desc' },
      select: this.historySelect,
    });
  }

  private readonly historySelect = {
    totalScore: true,
    maxScore: true,
    correctCount: true,
    incorrectCount: true,
    unattemptedCount: true,
    overallRank: true,
    batchRank: true,
    percentile: true,
    published: true,
    createdAt: true,
    exam: { select: { id: true, title: true, startAt: true } },
  } as const;
}
