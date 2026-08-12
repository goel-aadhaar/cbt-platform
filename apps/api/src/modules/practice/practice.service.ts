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
  QueryPracticeDto,
  StartSessionDto,
} from './dto/practice.dto';

/**
 * Student-facing practice library (§2.4).
 *
 * Serves only questions a teacher has explicitly curated into the library
 * (`inPracticeLibrary`) AND that are APPROVED — never the whole bank.
 *
 * SECURITY: the select below deliberately omits `answerKey` and `explanation`.
 * A practice question may also be used in a live exam, so shipping its key to
 * the browser would leak exam answers. Grading therefore happens server-side via
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
      select: { id: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');
    return student;
  }

  /** Base scope: this tenant's curated, approved, active practice questions. */
  private scope(): Prisma.QuestionWhereInput {
    return {
      instituteId: this.instituteId(),
      inPracticeLibrary: true,
      status: 'APPROVED',
      isActive: true,
    };
  }

  /**
   * Subjects → chapters → topics available to drill, with counts, so the
   * practice UI can build its pickers without pulling every question.
   */
  async facets() {
    const student = await this.currentStudent();

    const [rows, practised] = await Promise.all([
      this.prisma.question.findMany({
        where: this.scope(),
        select: {
          id: true,
          subject: true,
          chapter: true,
          topic: true,
          difficulty: true,
        },
      }),
      /**
       * DISTINCT questions this student has ever answered in practice. The
       * library reports progress as "54 of 120 practised", so a question
       * drilled in three sessions must count once.
       */
      this.prisma.practiceAnswer.findMany({
        where: { session: { studentId: student.id } },
        select: { questionId: true, correct: true },
        distinct: ['questionId'],
      }),
    ]);

    const seen = new Map(practised.map((p) => [p.questionId, p.correct]));

    interface TopicAgg {
      topic: string;
      count: number;
      practised: number;
      correct: number;
    }
    interface ChapterAgg {
      chapter: string;
      count: number;
      practised: number;
      correct: number;
      topics: Map<string, TopicAgg>;
    }
    interface SubjectAgg {
      subject: string;
      count: number;
      practised: number;
      correct: number;
      chapters: Map<string, ChapterAgg>;
    }

    const subjects = new Map<string, SubjectAgg>();
    const difficulties: Record<string, number> = {};
    let practisedTotal = 0;

    for (const r of rows) {
      difficulties[r.difficulty] = (difficulties[r.difficulty] ?? 0) + 1;
      const done = seen.has(r.id);
      const right = seen.get(r.id) === true;
      if (done) practisedTotal += 1;

      const subject = subjects.get(r.subject) ?? {
        subject: r.subject,
        count: 0,
        practised: 0,
        correct: 0,
        chapters: new Map<string, ChapterAgg>(),
      };
      subject.count += 1;
      if (done) subject.practised += 1;
      if (right) subject.correct += 1;

      const chapter = subject.chapters.get(r.chapter) ?? {
        chapter: r.chapter,
        count: 0,
        practised: 0,
        correct: 0,
        topics: new Map<string, TopicAgg>(),
      };
      chapter.count += 1;
      if (done) chapter.practised += 1;
      if (right) chapter.correct += 1;

      if (r.topic) {
        const topic = chapter.topics.get(r.topic) ?? {
          topic: r.topic,
          count: 0,
          practised: 0,
          correct: 0,
        };
        topic.count += 1;
        if (done) topic.practised += 1;
        if (right) topic.correct += 1;
        chapter.topics.set(r.topic, topic);
      }

      subject.chapters.set(r.chapter, chapter);
      subjects.set(r.subject, subject);
    }

    /** Share of a scope's questions answered correctly at least once. */
    const mastery = (correct: number, count: number) =>
      count === 0 ? 0 : Math.round((correct / count) * 100);

    return {
      total: rows.length,
      practised: practisedTotal,
      difficulties,
      subjects: [...subjects.values()]
        .map((s) => ({
          subject: s.subject,
          count: s.count,
          practised: s.practised,
          mastery: mastery(s.correct, s.count),
          chapters: [...s.chapters.values()]
            .map((c) => ({
              chapter: c.chapter,
              count: c.count,
              practised: c.practised,
              mastery: mastery(c.correct, c.count),
              topics: [...c.topics.values()]
                .map((t) => ({
                  topic: t.topic,
                  count: t.count,
                  practised: t.practised,
                  mastery: mastery(t.correct, t.count),
                }))
                .sort((a, b) => a.topic.localeCompare(b.topic)),
            }))
            .sort((a, b) => a.chapter.localeCompare(b.chapter)),
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject)),
    };
  }

  /** A practice set matching the student's filters (answer keys withheld). */
  async questions(query: QueryPracticeDto) {
    const items = await this.prisma.question.findMany({
      where: {
        ...this.scope(),
        ...(query.subject ? { subject: query.subject } : {}),
        ...(query.chapter ? { chapter: query.chapter } : {}),
        ...(query.topic ? { topic: query.topic } : {}),
        ...(query.difficulty ? { difficulty: query.difficulty } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
      },
      select: practiceSelect,
      take: Math.min(query.limit ?? 25, 50),
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((q) => this.withMedia(q)), total: items.length };
  }

  /* ---------------------------------------------------------------- *
   * Sessions — the persistence behind the library's progress views.   *
   * ---------------------------------------------------------------- */

  /**
   * Open a practice session and hand back its question set.
   *
   * Nothing here touches Attempt/Result: practice is separate from exams by
   * design, and a session can never affect a report card.
   */
  async startSession(dto: StartSessionDto) {
    const student = await this.currentStudent();

    const items = await this.prisma.question.findMany({
      where: {
        ...this.scope(),
        subject: dto.subject,
        ...(dto.chapter ? { chapter: dto.chapter } : {}),
        ...(dto.topic ? { topic: dto.topic } : {}),
        ...(dto.difficulty ? { difficulty: dto.difficulty } : {}),
      },
      select: practiceSelect,
      take: Math.min(dto.size ?? 25, 50),
      orderBy: { createdAt: 'desc' },
    });

    if (items.length === 0) {
      throw new NotFoundException('No practice questions match that selection');
    }

    const session = await this.prisma.practiceSession.create({
      data: {
        instituteId: this.instituteId(),
        studentId: student.id,
        subject: dto.subject,
        chapter: dto.chapter ?? null,
        topic: dto.topic ?? null,
        totalCount: items.length,
        timed: dto.timed ?? false,
      },
      select: { id: true, startedAt: true, totalCount: true, timed: true },
    });

    return { session, items: items.map((q) => this.withMedia(q)) };
  }

  /**
   * Grade one answer inside a session and record it.
   *
   * The recording is what makes chapter progress and topic mastery possible;
   * the grading itself is the same `check` used by the standalone endpoint.
   */
  async answerInSession(sessionId: string, dto: CheckAnswerDto) {
    const student = await this.currentStudent();
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, studentId: student.id },
      select: { id: true, completedAt: true },
    });
    if (!session) throw new NotFoundException('Practice session not found');
    if (session.completedAt) {
      throw new BadRequestException(
        'This practice session is already finished',
      );
    }

    const result = await this.check(dto);

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
   * this student's own average on the same scope (the design's "You performed
   * X% better than your average in this topic").
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

    // Average accuracy across this student's OTHER completed sets in the same
    // scope — the baseline the summary compares against.
    const previous = await this.prisma.practiceSession.findMany({
      where: {
        studentId: student.id,
        subject: session.subject,
        ...(session.topic
          ? { topic: session.topic }
          : session.chapter
            ? { chapter: session.chapter }
            : {}),
        completedAt: { not: null },
        id: { not: sessionId },
        answeredCount: { gt: 0 },
      },
      select: { correctCount: true, answeredCount: true },
    });

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
      subject: finished.subject,
      chapter: finished.chapter,
      topic: finished.topic,
      total: finished.totalCount,
      answered: finished.answeredCount,
      correct: finished.correctCount,
      accuracy,
      durationSeconds: finished.durationSeconds,
      personalAverage,
      /** Percentage points above (or below) their own average. */
      deltaVsAverage:
        personalAverage === null ? null : accuracy - personalAverage,
    };
  }

  /**
   * Grade one committed answer and reveal the key + explanation for THAT
   * question only. Scored with the same `isCorrect` used by exam evaluation, so
   * practice feedback can never disagree with real marking.
   */
  async check(dto: CheckAnswerDto) {
    const question = await this.prisma.question.findFirst({
      where: { ...this.scope(), id: dto.questionId },
      select: {
        id: true,
        type: true,
        answerKey: true,
        explanation: true,
        marks: true,
      },
    });
    if (!question) {
      throw new NotFoundException('Question is not in the practice library');
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
