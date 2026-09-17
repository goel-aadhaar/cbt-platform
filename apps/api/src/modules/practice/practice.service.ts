import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { MediaStoragePort } from '../media/ports/media-storage.port';
import { isCorrect } from '../results/scoring';
import {
  CheckAnswerDto,
  CompleteSessionDto,
  StartSessionDto,
} from './dto/practice.dto';

/**
 * Student-facing DPP attempts (§ Product Structure).
 *
 * A session is an attempt at one named, teacher-curated DPP — fixed question
 * set, in the order the teacher built it. No timer, no proctoring, no
 * Attempt/Result row: practice stays separate from exams by design, and a
 * session can never affect a report card.
 *
 * SECURITY: the select below deliberately omits `answerKey` and `explanation`.
 * A DPP question may also be used in a live exam, so shipping its key to the
 * browser would leak exam answers. Grading therefore happens server-side via
 * `check()`, which returns the key only after the student has committed an
 * answer for that question.
 */
const practiceSelect = {
  id: true,
  subject: true,
  chapter: true,
  topic: true,
  difficulty: true,
  type: true,
  statement: true,
  options: true,
  marks: true,
  negativeMarks: true,
  // A diagram question is unanswerable without its image (§2.7).
  mediaKeys: true,
} satisfies Prisma.QuestionSelect;

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly media: MediaStoragePort,
  ) {}

  /** Stored keys -> loadable URLs (CDN when configured, else the API route). */
  private withMedia<T extends { mediaKeys: string[] }>(q: T) {
    return {
      ...q,
      media: q.mediaKeys.map((key) => ({
        key,
        url:
          this.media.publicUrl(key) ?? `/media/file/${encodeURIComponent(key)}`,
      })),
    };
  }

  private instituteId(): string {
    const id = this.tenant.get()?.instituteId;
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  /** The Student row behind the calling user — sessions are keyed on it. */
  private async currentStudent() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');
    return student;
  }

  /**
   * The DPP, if it exists in this institute AND was actually assigned to
   * the calling student's own batch — the same "batch is the whole
   * permission" rule Resources uses. A 404 rather than a 403: confirming it
   * exists would tell the student what other batches were offered, which is
   * the thing being withheld.
   */
  private async ownedDpp(dppId: string, batchId: string) {
    const dpp = await this.prisma.dpp.findFirst({
      where: {
        id: dppId,
        instituteId: this.instituteId(),
        isActive: true,
        batches: { some: { batchId } },
      },
      select: {
        id: true,
        subject: { select: { name: true } },
        chapter: { select: { name: true } },
        questions: {
          orderBy: { order: 'asc' },
          select: { question: { select: practiceSelect } },
        },
      },
    });
    if (!dpp) throw new NotFoundException('DPP not found');
    return dpp;
  }

  /* ---------------------------------------------------------------- *
   * Sessions                                                          *
   * ---------------------------------------------------------------- */

  /**
   * Open (or resume) a session over one named DPP.
   *
   * An unfinished session over the SAME DPP is handed back as-is rather than
   * starting a second one — a student who backs out mid-paper and reopens it
   * continues where they left off instead of losing their progress. Once
   * completed, opening it again starts a fresh attempt: DPP is meant for
   * repeated revision, not a one-shot exam.
   */
  async startSession(dto: StartSessionDto) {
    const student = await this.currentStudent();
    const dpp = await this.ownedDpp(dto.dppId, student.batchId);

    if (dpp.questions.length === 0) {
      throw new BadRequestException('This DPP has no questions yet');
    }

    const existing = await this.prisma.practiceSession.findFirst({
      where: { dppId: dpp.id, studentId: student.id, completedAt: null },
      select: { id: true, startedAt: true, totalCount: true, timed: true },
    });
    const session =
      existing ??
      (await this.prisma.practiceSession.create({
        data: {
          instituteId: this.instituteId(),
          studentId: student.id,
          dppId: dpp.id,
          subject: dpp.subject?.name ?? 'DPP',
          chapter: dpp.chapter?.name ?? null,
          totalCount: dpp.questions.length,
        },
        select: { id: true, startedAt: true, totalCount: true, timed: true },
      }));

    const items = dpp.questions.map((dq) => this.withMedia(dq.question));
    return { session, items };
  }

  /**
   * Grade one answer inside a session and record it.
   *
   * The recording is what makes the completion summary possible; the grading
   * itself is the same `check` every other candidate-facing surface uses.
   */
  async answerInSession(sessionId: string, dto: CheckAnswerDto) {
    const student = await this.currentStudent();
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, studentId: student.id },
      select: { id: true, completedAt: true, dppId: true },
    });
    if (!session) throw new NotFoundException('Practice session not found');
    if (session.completedAt) {
      throw new BadRequestException(
        'This practice session is already finished',
      );
    }

    const result = await this.check(dto, session.dppId);

    // Re-answering the same question in one set must not double-count.
    const existing = await this.prisma.practiceAnswer.findUnique({
      where: {
        sessionId_questionId: { sessionId, questionId: dto.questionId },
      },
      select: { id: true, correct: true },
    });

    if (existing) {
      if (existing.correct !== result.correct) {
        await this.prisma.$transaction([
          this.prisma.practiceAnswer.update({
            where: { id: existing.id },
            data: { correct: result.correct },
          }),
          this.prisma.practiceSession.update({
            where: { id: sessionId },
            data: { correctCount: { increment: result.correct ? 1 : -1 } },
          }),
        ]);
      }
    } else {
      await this.prisma.$transaction([
        this.prisma.practiceAnswer.create({
          data: {
            sessionId,
            questionId: dto.questionId,
            correct: result.correct,
          },
        }),
        this.prisma.practiceSession.update({
          where: { id: sessionId },
          data: {
            answeredCount: { increment: 1 },
            correctCount: { increment: result.correct ? 1 : 0 },
          },
        }),
      ]);
    }

    return result;
  }

  /**
   * Close a session and return its summary, including how it compares with
   * this student's own average on the SAME DPP — "You performed X% better
   * than last time" — null on a first attempt.
   */
  async completeSession(sessionId: string, dto: CompleteSessionDto) {
    const student = await this.currentStudent();
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, studentId: student.id },
    });
    if (!session) throw new NotFoundException('Practice session not found');

    const finished =
      session.completedAt !== null
        ? session
        : await this.prisma.practiceSession.update({
            where: { id: sessionId },
            data: {
              completedAt: new Date(),
              durationSeconds: Math.max(0, dto.durationSeconds ?? 0),
            },
          });

    // Average accuracy across this student's OTHER completed attempts at the
    // SAME DPP — the baseline the summary compares against.
    const previous = finished.dppId
      ? await this.prisma.practiceSession.findMany({
          where: {
            studentId: student.id,
            dppId: finished.dppId,
            completedAt: { not: null },
            id: { not: sessionId },
            answeredCount: { gt: 0 },
          },
          select: { correctCount: true, answeredCount: true },
        })
      : [];

    const accuracy =
      finished.answeredCount === 0
        ? 0
        : Math.round((finished.correctCount / finished.answeredCount) * 100);

    const personalAverage =
      previous.length === 0
        ? null
        : Math.round(
            previous.reduce(
              (sum, p) => sum + (p.correctCount / p.answeredCount) * 100,
              0,
            ) / previous.length,
          );

    return {
      sessionId: finished.id,
      dppId: finished.dppId,
      subject: finished.subject,
      chapter: finished.chapter,
      total: finished.totalCount,
      answered: finished.answeredCount,
      correct: finished.correctCount,
      accuracy,
      durationSeconds: finished.durationSeconds,
      personalAverage,
      /** Percentage points above (or below) their own past attempts. */
      deltaVsAverage:
        personalAverage === null ? null : accuracy - personalAverage,
    };
  }

  /**
   * Grade one committed answer and reveal the key + explanation for THAT
   * question only. Scored with the same `isCorrect` used by exam evaluation, so
   * practice feedback can never disagree with real marking.
   *
   * `dppId` scopes which questions are eligible — a session can only grade a
   * question that is actually in the DPP it was opened against, closing the
   * gap a crafted questionId in the request body would otherwise open.
   */
  async check(dto: CheckAnswerDto, dppId: string | null) {
    const question = await this.prisma.question.findFirst({
      where: {
        id: dto.questionId,
        instituteId: this.instituteId(),
        ...(dppId ? { dppQuestions: { some: { dppId } } } : {}),
      },
      select: {
        id: true,
        type: true,
        answerKey: true,
        explanation: true,
        marks: true,
      },
    });
    if (!question) {
      throw new NotFoundException('Question is not part of this DPP');
    }

    const correct = isCorrect(question.type, dto.answer, question.answerKey);

    return {
      questionId: question.id,
      correct,
      correctAnswer: question.answerKey,
      explanation: question.explanation,
      marks: correct ? question.marks : 0,
    };
  }
}
