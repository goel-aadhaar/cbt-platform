import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ExamQuestionScoring,
  QuestionType,
  ResponseStatus,
  ResultPolicy,
} from '../../generated/prisma/enums';
import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';

import { Prisma } from '../../generated/prisma/client';
import { toCsv, withBom } from '../../common/csv/to-csv';
import type { CsvCell } from '../../common/csv/to-csv';
import { PrismaService } from '../../database/prisma.service';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryResultsDto } from './dto/query-results.dto';
import { SetManualScoreDto } from './dto/set-manual-score.dto';
import { SetManualScoresDto } from './dto/set-manual-scores.dto';
import {
  assignCompetitionRanks,
  isCorrect,
  percentilesByScore,
} from './scoring';

/** See QueryResultsDto for why this default is generous rather than tight. */
const DEFAULT_RESULTS_PAGE_SIZE = 500;

export interface SectionScore {
  sectionId: string;
  name: string;
  score: number;
  /**
   * Marks obtainable in this section, and how many questions carry them —
   * what makes a section *percentage* (and so section accuracy) computable.
   * Optional on read: rows written before these were added simply omit them.
   */
  maxScore: number;
  questionCount: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  /** Time the candidate spent in this section (§2.8 historical record). */
  seconds: number;
}

/**
 * Fewest candidates for which a cohort average is still an aggregate. Below
 * this, "the average" plus the reader's own score narrows the remaining
 * candidates' scores too far — see {@link ResultsService.getCohortForStudent}.
 */
const COHORT_MIN = 5;

/**
 * "Priya Sharma" -> "Priya S."
 *
 * How a peer is named on the leaderboard. A surname initial is enough for a
 * classmate to recognise who is meant without the board becoming a published
 * list of full names attached to scores. A single-word name is left as it is —
 * there is nothing to abbreviate, and truncating it would just be wrong.
 */
function abbreviateName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Akash Verma" -> "AV". Falls back to one letter for a single-word name. */
function initialsOf(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * `Result.sectionScores` is Json, so it can be anything the column happens to
 * hold — including null for a row written before sections were recorded.
 * Readers must not assume an array.
 */
function readSectionScores(value: unknown): SectionScore[] {
  if (!Array.isArray(value)) return [];
  // Narrowed through `unknown[]` rather than trusting the `any[]` Prisma hands
  // back for a Json column: an `any` here would quietly switch off type
  // checking on every field read downstream.
  return (value as unknown[]).filter(
    (v): v is SectionScore =>
      typeof v === 'object' && v !== null && 'sectionId' in v && 'score' in v,
  );
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
    private readonly teacherScope: TeacherScopeService,
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

    /**
     * Batch as it was WHEN THE PAPER WAS SAT, not as it is now.
     *
     * `Result.batchId` is written once on the first evaluation and never
     * updated, but batch ranks used to be grouped by the student's *current*
     * batch. Moving a student after an exam therefore re-ranked their old
     * result against a cohort it does not belong to, and wrote that rank onto
     * a row still labelled with the original batch — the two disagreed.
     * Re-using the stored batch keeps a concluded exam's batch ranks stable no
     * matter how the roster is reorganised afterwards.
     */
    const priorResults = await this.prisma.result.findMany({
      where: { examId, instituteId },
      select: { attemptId: true, batchId: true },
    });
    const batchAtEvaluation = new Map(
      priorResults.map((r) => [r.attemptId, r.batchId]),
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
            maxScore: 0,
            questionCount: 0,
            correct: 0,
            incorrect: 0,
            unattempted: 0,
            seconds: secondsByKey.get(`${att.id}:${m.sectionId}`) ?? 0,
          } satisfies SectionScore);

        // Every question still in `meta` is obtainable (DROPPED ones were
        // filtered out above), so this mirrors the exam-wide `maxScore` sum.
        sec.maxScore += m.marksCorrect;
        sec.questionCount += 1;

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
        // Snapshot semantics — see `batchAtEvaluation` above.
        batchId: batchAtEvaluation.get(att.id) ?? att.student.batchId,
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
    const now = new Date();

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
            publishedAt: autoPublish ? now : null,
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
            //
            // `publishedAt` tracks that decision rather than the re-evaluation:
            // a paper that was already visible keeps its original release time
            // (re-scoring is not a re-release), and one that gets re-hidden has
            // it cleared. Only a hidden→visible flip stamps a new timestamp.
            ...(opts.preservePublished
              ? {}
              : {
                  published: autoPublish,
                  ...(autoPublish ? {} : { publishedAt: null }),
                }),
          },
        }),
      ),
    );

    // An upsert's `update` cannot read the row's current value, so a result
    // that flipped hidden→visible in the block above would be `published` with
    // no release time. Stamp exactly those; already-visible rows keep the
    // timestamp they had, which is the point of tracking it separately.
    await this.prisma.result.updateMany({
      where: { examId, instituteId, published: true, publishedAt: null },
      data: { publishedAt: now },
    });

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
    const { batchIds } = await this.requireExam(examId);

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
      // Scoped to the caller's batches when TEACHER (§ batch-scoped teacher
      // access) — hit rate must never implicitly include another batch's
      // candidates, even anonymized.
      this.prisma.attempt.findMany({
        where: {
          examId,
          instituteId,
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
          ...(batchIds && { student: { batchId: { in: batchIds } } }),
        },
        select: { responses: { select: { questionId: true, answer: true } } },
      }),
    ]);

    // One pass over every attempt's responses (not questions × candidates
    // with a per-question .find() over each attempt's responses) — this used
    // to be O(questions × candidates × responses-per-attempt), which for a
    // large exam (hundreds of questions, thousands of candidates) is a real
    // multi-second stall on an admin-facing panel.
    const questionMeta = new Map(
      rows.map((r) => [r.questionId, r.question] as const),
    );
    const stats = new Map<string, { attempted: number; correct: number }>();
    for (const a of attempts) {
      for (const r of a.responses) {
        const cur = stats.get(r.questionId) ?? { attempted: 0, correct: 0 };
        if (r.answer !== null) {
          cur.attempted += 1;
          const q = questionMeta.get(r.questionId);
          if (q && isCorrect(q.type, r.answer, q.answerKey)) {
            cur.correct += 1;
          }
        }
        stats.set(r.questionId, cur);
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

    /**
     * Re-score the exam straight away.
     *
     * A manual award only reaches a candidate's total through `evaluate()`, so
     * writing the `ManualScore` row alone left every stored `Result` stale
     * until somebody happened to press Recalculate — and the award silently did
     * nothing in the meantime. Worse, it also moves ranks and percentiles for
     * *other* candidates, so a half-applied award is not merely incomplete, it
     * is inconsistent.
     *
     * `preservePublished` keeps an already-visible result visible: awarding
     * marks should raise what a candidate sees, not pull their result back into
     * review. Same treatment as an answer-key correction and a bonus/dropped
     * question.
     */
    const recalculated = await this.evaluate(examId, {
      preservePublished: true,
    });

    return {
      ...saved,
      scoring: examQuestion.scoring,
      // Surfaced so the caller can tell the admin the award actually landed.
      recalculated: { evaluated: recalculated.evaluated },
    };
  }

  /**
   * The grading list for one MANUAL question (§2.5).
   *
   * Setting a question to MANUAL takes it out of auto-scoring, which means
   * every candidate scores zero on it until somebody awards marks by hand.
   * That is the whole reason this exists: without a roster showing each
   * candidate's actual answer, "manual evaluation" is a switch that silently
   * zeroes a question and offers no way to undo the damage.
   *
   * Batch-scoped for a TEACHER, exactly like the hit-rate list — a teacher must
   * not read another batch's answers, and grading is the most revealing view of
   * an answer there is.
   */
  async manualRoster(examId: string, questionId: string) {
    const instituteId = this.instituteId();
    const { batchIds } = await this.requireExam(examId);

    const examQuestion = await this.prisma.examQuestion.findFirst({
      where: { examId, questionId, instituteId },
      select: {
        scoring: true,
        section: { select: { name: true, marksCorrect: true } },
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
    });
    if (!examQuestion) {
      throw new NotFoundException('Question is not part of this exam');
    }

    const attempts = await this.prisma.attempt.findMany({
      where: {
        examId,
        instituteId,
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        ...(batchIds && { student: { batchId: { in: batchIds } } }),
      },
      select: {
        id: true,
        student: {
          select: {
            rollNumber: true,
            user: { select: { name: true } },
            batch: { select: { id: true, name: true } },
          },
        },
        responses: {
          where: { questionId },
          select: { answer: true, status: true },
        },
      },
      orderBy: { student: { rollNumber: 'asc' } },
    });

    const awards = await this.prisma.manualScore.findMany({
      where: { examId, instituteId, questionId },
      select: { attemptId: true, marks: true },
    });
    const awardByAttempt = new Map(awards.map((a) => [a.attemptId, a.marks]));

    return {
      questionId,
      scoring: examQuestion.scoring,
      statement: examQuestion.question.statement,
      type: examQuestion.question.type,
      answerKey: examQuestion.question.answerKey,
      section: examQuestion.section?.name ?? null,
      /**
       * The section's own marks win over the question's default: an exam can
       * re-mark a question when it attaches it, and grading against the wrong
       * ceiling is how a candidate ends up with more marks than the paper has.
       */
      maxMarks:
        examQuestion.section?.marksCorrect ?? examQuestion.question.marks,
      items: attempts.map((a) => ({
        attemptId: a.id,
        student: {
          name: a.student.user.name,
          rollNumber: a.student.rollNumber,
          batch: a.student.batch?.name ?? null,
        },
        // `responses` is filtered to this question, so there is at most one.
        answer: a.responses[0]?.answer ?? null,
        status: a.responses[0]?.status ?? 'NOT_VISITED',
        // null, not 0 — "not graded yet" and "graded zero" are different
        // states, and only the grader can tell them apart.
        awarded: awardByAttempt.get(a.id) ?? null,
      })),
    };
  }

  /**
   * Award manual marks to many candidates at once (§2.5).
   *
   * The per-candidate {@link setManualScore} re-evaluates the whole exam on
   * every call, which is correct but unusable for grading: a 200-candidate
   * question would run 200 full evaluations, each one re-ranking every
   * candidate. This writes every award in one transaction and evaluates once
   * at the end, so ranks move a single time, from one consistent state to the
   * next.
   */
  async setManualScores(examId: string, dto: SetManualScoresDto) {
    const instituteId = this.instituteId();
    const { batchIds } = await this.requireExam(examId);

    const examQuestion = await this.prisma.examQuestion.findFirst({
      where: { examId, questionId: dto.questionId, instituteId },
      select: {
        scoring: true,
        section: { select: { marksCorrect: true } },
        question: { select: { marks: true } },
      },
    });
    if (!examQuestion) {
      throw new NotFoundException('Question is not part of this exam');
    }
    if (examQuestion.scoring !== 'MANUAL') {
      throw new BadRequestException(
        'That question is not set to manual evaluation, so awarding marks by ' +
          'hand would be overwritten the next time the exam is scored. Set it ' +
          'to Manual first.',
      );
    }

    const max =
      examQuestion.section?.marksCorrect ?? examQuestion.question.marks;
    const over = dto.awards.filter((a) => a.marks > max || a.marks < 0);
    if (over.length > 0) {
      throw new BadRequestException(
        `Marks must be between 0 and ${max} for this question. ` +
          `${over.length} award(s) were outside that range.`,
      );
    }

    /**
     * Every attempt must belong to this exam AND be in scope. Checked as a set
     * rather than per row: a single query settles it, and a request naming one
     * attempt from another batch is rejected whole rather than half-applied.
     */
    const attemptIds = [...new Set(dto.awards.map((a) => a.attemptId))];
    const valid = await this.prisma.attempt.findMany({
      where: {
        id: { in: attemptIds },
        examId,
        instituteId,
        ...(batchIds && { student: { batchId: { in: batchIds } } }),
      },
      select: { id: true },
    });
    if (valid.length !== attemptIds.length) {
      throw new NotFoundException(
        'One or more of those candidates are not part of this exam.',
      );
    }

    await this.prisma.$transaction(
      dto.awards.map((a) =>
        this.prisma.manualScore.upsert({
          where: {
            attemptId_questionId: {
              attemptId: a.attemptId,
              questionId: dto.questionId,
            },
          },
          create: {
            examId,
            instituteId,
            attemptId: a.attemptId,
            questionId: dto.questionId,
            marks: a.marks,
          },
          update: { marks: a.marks },
        }),
      ),
    );

    // Same treatment as every other correction: apply now, and never pull a
    // published result back into review because it was re-scored.
    const recalculated = await this.evaluate(examId, {
      preservePublished: true,
    });

    return {
      questionId: dto.questionId,
      graded: dto.awards.length,
      recalculated: {
        evaluated: recalculated.evaluated,
        maxScore: recalculated.maxScore,
      },
    };
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
      data: { published: true, publishedAt: new Date() },
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
      // Cleared, not kept: a held result is not "released as of" anything, and
      // re-publishing it later is a new release with a new timestamp.
      data: { published: false, publishedAt: null },
    });
    return { held: res.count, ...(batchId ? { batchId } : {}) };
  }

  async listForExam(examId: string, query: QueryResultsDto = {}) {
    const { batchIds } = await this.requireExam(examId);
    const where: Prisma.ResultWhereInput = {
      examId,
      instituteId: this.instituteId(),
      ...(batchIds && { batchId: { in: batchIds } }),
    };
    const limit = query.limit ?? DEFAULT_RESULTS_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.result.findMany({
        where,
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
        take: limit,
        skip: offset,
      }),
      this.prisma.result.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  /**
   * Shared ranked result-sheet data for an exam (§2.14). Admin export — includes
   * both held and published rows. Reused by the CSV / Excel / PDF exporters.
   */
  private async buildResultSheet(examId: string) {
    const instituteId = this.instituteId();
    const { title, batchIds } = await this.requireExam(examId);

    const results = await this.prisma.result.findMany({
      where: {
        examId,
        instituteId,
        ...(batchIds && { batchId: { in: batchIds } }),
      },
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
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'exam';
    return { title, slug, headers, rows };
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
    wb.creator = 'Codonmind Nexus';
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
        publishedAt: true,
        // The pass mark and the paper's own length are what turn a bare score
        // into "did I pass" and "what share did I attempt" on the result page.
        exam: {
          select: {
            id: true,
            title: true,
            passingMarks: true,
            durationMinutes: true,
          },
        },
        // Total time taken is `submittedAt - startedAt`; without these the
        // student page had to fetch the whole attempt list to find them.
        attempt: {
          select: { startedAt: true, submittedAt: true, status: true },
        },
      },
    });
    if (!result) throw new NotFoundException('Result not available yet');

    // Cohort size, so a rank reads as "12 of 240" rather than a bare "#12".
    const cohortSize = await this.prisma.result.count({
      where: { examId: result.exam.id, instituteId: ctx.instituteId },
    });

    return { ...result, attemptId, cohortSize };
  }

  /**
   * How the candidate's score sits against everyone else who sat the paper
   * (§2.8 "score comparison"). Aggregates only — never another candidate's
   * name, roll number or individual score.
   *
   * Suppressed below {@link COHORT_MIN} candidates: with a cohort of two, an
   * average plus your own score is that other person's score exactly, so a
   * small cohort makes an "aggregate" no longer an aggregate. The page shows
   * the panel as unavailable rather than showing a misleading comparison.
   *
   * The comparison set is every *evaluated* result, not only published ones —
   * a batch-by-batch release must not make the class average drift as each
   * batch is let through.
   */
  async getCohortForStudent(attemptId: string) {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const mine = await this.prisma.result.findFirst({
      where: { attemptId, studentId: student.id, published: true },
      select: { examId: true, batchId: true, totalScore: true },
    });
    if (!mine) throw new NotFoundException('Result not available yet');

    const rows = await this.prisma.result.findMany({
      where: { examId: mine.examId, instituteId: ctx.instituteId },
      select: { totalScore: true, batchId: true, sectionScores: true },
    });

    const cohortSize = rows.length;
    if (cohortSize < COHORT_MIN) {
      return { available: false as const, cohortSize, batchSize: 0 };
    }

    const scores = rows.map((r) => r.totalScore).sort((a, b) => a - b);
    const mean = (xs: number[]) =>
      xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
    // Even-length cohorts average the two middle values, the usual convention.
    const mid = Math.floor(scores.length / 2);
    const median =
      scores.length % 2 === 0
        ? (scores[mid - 1] + scores[mid]) / 2
        : scores[mid];

    const batchScores = rows
      .filter((r) => r.batchId === mine.batchId)
      .map((r) => r.totalScore);

    // Per-section cohort averages, so the section table can show a delta per
    // section rather than only one number for the whole paper.
    const sectionTotals = new Map<
      string,
      { name: string; sum: number; n: number }
    >();
    for (const row of rows) {
      const sections = Array.isArray(row.sectionScores)
        ? (row.sectionScores as unknown as SectionScore[])
        : [];
      for (const s of sections) {
        const acc = sectionTotals.get(s.sectionId) ?? {
          name: s.name,
          sum: 0,
          n: 0,
        };
        acc.sum += s.score;
        acc.n += 1;
        sectionTotals.set(s.sectionId, acc);
      }
    }

    return {
      available: true as const,
      cohortSize,
      batchSize: batchScores.length,
      average: mean(scores),
      median,
      highest: scores[scores.length - 1],
      lowest: scores[0],
      // Suppressed on the same reasoning as the cohort itself — a two-person
      // batch would otherwise leak through the batch average instead.
      batchAverage: batchScores.length >= COHORT_MIN ? mean(batchScores) : null,
      sections: [...sectionTotals.entries()].map(([sectionId, acc]) => ({
        sectionId,
        name: acc.name,
        averageScore: acc.sum / acc.n,
      })),
    };
  }

  /**
   * Leaderboard for the paper this attempt belongs to (Figma: Performance
   * Reports / Leaderboard).
   *
   * This is the one student-facing payload that names OTHER candidates, so the
   * disclosure rules are the whole design of it:
   *
   *  - Peers appear as "Priya S." — given name plus surname initial, never a
   *    full name and never a roll number. The caller sees their OWN name in
   *    full, flagged `you`, which is what makes their row findable.
   *  - Suppressed entirely below {@link COHORT_MIN}, for the same reason
   *    {@link getCohortForStudent} is: in a cohort of three, "rank 2 scored
   *    88%" is a named individual's result, whatever the label says.
   *  - Gated on the CALLER's own result being published. A leaderboard is a
   *    result, so it must not appear before results are released.
   *  - Ranks come from the stored `overallRank` / `batchRank`, never recomputed
   *    here, so the board can never disagree with the result page.
   *
   * `scope` picks which cohort the ranking is within: the whole institute, or
   * the caller's own batch.
   */
  async getLeaderboardForStudent(
    attemptId: string,
    scope: 'OVERALL' | 'BATCH' = 'OVERALL',
    limit = 10,
  ) {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const mine = await this.prisma.result.findFirst({
      where: { attemptId, studentId: student.id, published: true },
      select: { examId: true, batchId: true, maxScore: true },
    });
    if (!mine) throw new NotFoundException('Result not available yet');

    const exam = await this.prisma.exam.findFirst({
      where: { id: mine.examId, instituteId: ctx.instituteId },
      select: { id: true, title: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const rows = await this.prisma.result.findMany({
      where: {
        examId: mine.examId,
        instituteId: ctx.instituteId,
        ...(scope === 'BATCH' ? { batchId: mine.batchId } : {}),
      },
      select: {
        studentId: true,
        totalScore: true,
        maxScore: true,
        percentile: true,
        overallRank: true,
        batchRank: true,
        sectionScores: true,
        batch: { select: { name: true } },
        student: {
          select: { id: true, user: { select: { name: true } } },
        },
      },
    });

    const cohortSize = rows.length;
    if (cohortSize < COHORT_MIN) {
      return {
        available: false as const,
        cohortSize,
        minimum: COHORT_MIN,
        scope,
        exam,
      };
    }

    const rank = (r: (typeof rows)[number]) =>
      scope === 'BATCH' ? r.batchRank : r.overallRank;

    /**
     * Percentile is recomputed for a batch-scoped board.
     *
     * `Result.percentile` is always institute-wide, so showing it beside a
     * batch rank put two different cohorts in the same row — "4th in your
     * batch, 78th percentile" where the percentile counted candidates the rank
     * had excluded. Recomputed here from the same scores the ranking uses, with
     * the same function `evaluate` uses, so the two numbers always describe one
     * cohort. Overall scope keeps the stored value, which is what the
     * candidate's own result page shows.
     */
    const batchPercentiles =
      scope === 'BATCH'
        ? percentilesByScore(rows.map((r) => r.totalScore))
        : null;
    const percentileFor = (r: (typeof rows)[number]) =>
      batchPercentiles
        ? (batchPercentiles.get(r.totalScore) ?? null)
        : r.percentile;

    const entries = rows
      .map((r) => {
        const isMe = r.studentId === student.id;
        return {
          rank: rank(r) ?? null,
          you: isMe,
          // Full name for the caller, abbreviated for everyone else.
          name: isMe
            ? r.student.user.name
            : abbreviateName(r.student.user.name),
          initials: initialsOf(r.student.user.name),
          totalScore: r.totalScore,
          maxScore: r.maxScore,
          percentile: percentileFor(r),
          batch: r.batch?.name ?? null,
          sections: readSectionScores(r.sectionScores),
        };
      })
      // Unranked rows (evaluated but never ranked) sort last rather than
      // colliding at the top as rank 0.
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

    const champion = entries[0] ?? null;

    /**
     * Best score in each section, which is what "subject-wise topper" means
     * here — exam sections are named after taxonomy subjects.
     *
     * Ties resolve to whoever is ranked higher overall, because `entries` is
     * already in rank order and only a strictly better score replaces the
     * incumbent.
     */
    const bySection = new Map<
      string,
      {
        sectionId: string;
        subject: string;
        student: string;
        initials: string;
        score: number;
        maxScore: number | null;
      }
    >();
    for (const e of entries) {
      for (const s of e.sections) {
        const held = bySection.get(s.sectionId);
        if (!held || s.score > held.score) {
          bySection.set(s.sectionId, {
            sectionId: s.sectionId,
            subject: s.name,
            student: e.name,
            initials: e.initials,
            score: s.score,
            maxScore: s.maxScore ?? null,
          });
        }
      }
    }

    /**
     * Per-section detail is stripped from peer rows.
     *
     * The board renders section scores in exactly two places — the champion's
     * chips and the subject-topper cards, both computed above — so carrying
     * every peer's per-subject correct/incorrect counts in the list would hand
     * out detail no part of the screen asks for. The caller's own row keeps it;
     * that is their own result.
     */
    const listed = entries.map((e) =>
      e.you ? e : { ...e, sections: [] as SectionScore[] },
    );

    const top = listed.slice(0, limit);
    const me = listed.find((e) => e.you) ?? null;

    return {
      available: true as const,
      cohortSize,
      scope,
      /**
       * Which cohort `percentile` counts. Tracks `scope`, but stated
       * separately so a caller reads the basis rather than inferring it.
       */
      percentileBasis: scope,
      exam,
      champion,
      // The podium is the first three; fewer if the cohort somehow has fewer
      // ranked rows than that.
      podium: listed.slice(0, 3),
      /**
       * Left in the order the sections appear on the paper, not sorted
       * alphabetically: a candidate reads "Physics, Chemistry, Biology"
       * because that is the order they sat them, and re-sorting would put
       * Biology first for no reason a reader could infer. `sectionScores` is
       * written in section order, and a Map keeps insertion order.
       */
      subjectToppers: [...bySection.values()],
      /**
       * The visible list. The caller's own row is appended when they placed
       * outside the top slice — a leaderboard that cannot show you your own
       * position is not much of a leaderboard.
       */
      rows: me && !top.some((e) => e.you) ? [...top, me] : top,
      me,
      truncated: listed.length > top.length,
    };
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
        startedAt: true,
        submittedAt: true,
        // `status` carries the marked-for-review flag (and the never-opened vs
        // opened-and-skipped distinction); `timeSpentMs` drives time analysis.
        responses: {
          select: {
            questionId: true,
            answer: true,
            status: true,
            timeSpentMs: true,
          },
        },
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
        durationMinutes: true,
        passingMarks: true,
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
                    // Classification, for the subject-wise breakdown and the
                    // per-question metadata the review screen shows.
                    subject: true,
                    chapter: true,
                    topic: true,
                    difficulty: true,
                    // Diagrams — the review screen rendered none of these
                    // before, so a question that *is* a diagram was unreadable.
                    mediaKeys: true,
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
    const responseByQuestion = new Map(
      attempt.responses.map((r) => [r.questionId, r]),
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

        const response = responseByQuestion.get(q.id);

        return {
          number,
          questionId: q.id,
          sectionId: section.id,
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
          // Classification for filtering and the subject-wise rollup.
          subject: q.subject,
          chapter: q.chapter,
          topic: q.topic,
          difficulty: q.difficulty,
          mediaKeys: q.mediaKeys,
          /**
           * Whether the candidate flagged this one during the exam. Read off
           * the saved response's status rather than a separate column — the
           * player already persists it there.
           */
          markedForReview:
            response?.status === ResponseStatus.MARKED ||
            response?.status === ResponseStatus.ANSWERED_MARKED,
          /** Never opened at all, as opposed to opened and left blank. */
          visited: response
            ? response.status !== ResponseStatus.NOT_VISITED
            : false,
          /** Null for attempts sat before per-question timing was recorded. */
          timeSpentMs: response?.timeSpentMs ?? null,
        };
      }),
    );

    return {
      attemptId: attempt.id,
      exam: {
        title: exam.title,
        durationMinutes: exam.durationMinutes,
        passingMarks: exam.passingMarks,
      },
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      summary: {
        ...result,
        totalQuestions: questions.length,
        attempted: questions.filter((q) => q.yourAnswer !== null).length,
        markedForReviewCount: questions.filter((q) => q.markedForReview).length,
      },
      questions,
    };
  }

  /**
   * Confirms the exam exists AND is visible to the caller, returning the
   * batch scope so callers don't re-derive it: a TEACHER may see an exam they
   * authored, or one assigned to at least one of their batches (mirrors
   * ExamsService.visibilityWhere — kept local rather than shared to avoid a
   * cross-module dependency for one identical OR-clause).
   */
  private async requireExam(
    examId: string,
  ): Promise<{ id: string; title: string; batchIds: string[] | null }> {
    const ctx = this.tenant.get();
    const instituteId = this.instituteId();
    const batchIds = await this.teacherScope.myBatchIds();
    const exam = await this.prisma.exam.findFirst({
      where: {
        id: examId,
        instituteId,
        ...(batchIds && {
          OR: [
            { createdById: ctx?.userId },
            { batches: { some: { batchId: { in: batchIds } } } },
          ],
        }),
      },
      select: { id: true, title: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return { id: exam.id, title: exam.title, batchIds };
  }
}
