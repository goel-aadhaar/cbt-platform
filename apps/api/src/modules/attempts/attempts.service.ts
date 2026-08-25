import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { MediaStoragePort } from '../media/ports/media-storage.port';
import {
  AttemptStatus,
  PRE_START_ATTEMPT_STATUSES,
  ResponseStatus,
} from './attempt.types';
import {
  RecordSectionTimeDto,
  ReportViolationDto,
  SaveResponseDto,
} from './dto/attempt.dto';

// NOTE: the question select deliberately omits answerKey/explanation — students
// must never receive the correct answers.
const stateSelect = {
  id: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  submittedAt: true,
  violationCount: true,
  flagged: true,
  exam: {
    select: {
      id: true,
      title: true,
      durationMinutes: true,
      instructions: true,
      calculatorEnabled: true,
      fullscreenRequired: true,
      maxViolations: true,
      sections: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          order: true,
          marksCorrect: true,
          marksWrong: true,
          questions: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              question: {
                select: {
                  id: true,
                  type: true,
                  statement: true,
                  options: true,
                  marks: true,
                  // Diagram-based questions are unanswerable without their
                  // image (§2.7); keys are resolved to URLs by shapeState().
                  mediaKeys: true,
                },
              },
            },
          },
        },
      },
    },
  },
  responses: { select: { questionId: true, status: true, answer: true } },
} satisfies Prisma.AttemptSelect;

/** A row shaped by {@link stateSelect} — what both candidate-state paths start from. */
type AttemptStateRow = Prisma.AttemptGetPayload<{ select: typeof stateSelect }>;

/**
 * Candidate exam engine (§2.2). A student starts one attempt per exam; the
 * server owns the clock (expiresAt) so it's refresh/reconnection-safe and
 * auto-submits on timeout. Responses auto-save with NTA palette states.
 */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly media: MediaStoragePort,
  ) {}

  /**
   * Turn stored media keys into something the browser can load (§2.7). A CDN
   * URL when the backend has one, otherwise the API's own streaming route.
   */
  private mediaUrls(keys: string[]): { key: string; url: string }[] {
    return keys.map((key) => ({
      key,
      url:
        this.media.publicUrl(key) ?? `/media/file/${encodeURIComponent(key)}`,
    }));
  }

  private async currentStudent() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, instituteId: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');
    return student;
  }

  /**
   * List the exams the current student can sit RIGHT NOW — published, in window,
   * assigned to the student's batch, and not yet submitted. Backs the student
   * portal's "Start a live exam" CTA so the wizard doesn't need a hard-coded
   * examId (the seed wipes + re-ids the demo tenant on every reseed).
   */
  async availableForStudent() {
    const student = await this.currentStudent();
    const now = new Date();

    const exams = await this.prisma.exam.findMany({
      where: {
        instituteId: student.instituteId,
        status: 'PUBLISHED',
        startAt: { lte: now },
        endAt: { gt: now },
        batches: { some: { batchId: student.batchId } },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        title: true,
        instructions: true,
        durationMinutes: true,
        startAt: true,
        endAt: true,
        attempts: {
          where: { studentId: student.id },
          select: { id: true, status: true },
        },
      },
    });

    /**
     * Exams scheduled for this student but not open yet. `items` is
     * deliberately "sittable right now"; the portal also needs to say what is
     * COMING, which it previously had no source for.
     */
    const upcoming = await this.prisma.exam.findMany({
      where: {
        instituteId: student.instituteId,
        status: 'PUBLISHED',
        startAt: { gt: now },
        batches: { some: { batchId: student.batchId } },
      },
      orderBy: { startAt: 'asc' },
      take: 10,
      select: {
        id: true,
        title: true,
        instructions: true,
        durationMinutes: true,
        startAt: true,
        endAt: true,
      },
    });

    return {
      items: exams.map((e) => ({
        id: e.id,
        title: e.title,
        instructions: e.instructions,
        durationMinutes: e.durationMinutes,
        startAt: e.startAt,
        endAt: e.endAt,
        attempt: e.attempts[0] ?? null,
      })),
      upcoming,
    };
  }

  /**
   * Request entry into an exam (§ exam entry approval). Creates the attempt
   * row PENDING an admin's decision — no clock runs yet. Idempotent: calling
   * it again while a request is already pending/approved/in-progress just
   * reads back the row's current state, and calling it after a DENIAL
   * reopens the request for a fresh review rather than leaving the student
   * stuck on a stale decision.
   *
   * Still the thundering-herd entry path (a whole batch opening the exam at
   * once), so the exam lookup and any existing attempt are fetched in one
   * parallel round, same as the old start().
   */
  async requestEntry(examId: string) {
    const student = await this.currentStudent();

    const [exam, existing] = await Promise.all([
      this.prisma.exam.findFirst({
        where: {
          id: examId,
          instituteId: student.instituteId,
          status: 'PUBLISHED',
        },
        select: {
          startAt: true,
          endAt: true,
          // Only this student's assignment — presence means they may sit it.
          batches: {
            where: { batchId: student.batchId },
            select: { id: true },
          },
        },
      }),
      this.prisma.attempt.findUnique({
        where: { examId_studentId: { examId, studentId: student.id } },
        select: { id: true, status: true, denialReason: true },
      }),
    ]);

    if (!exam) throw new NotFoundException('Exam not found or not published');

    const now = new Date();
    if (!exam.startAt || !exam.endAt || now < exam.startAt) {
      throw new BadRequestException('The exam has not started yet');
    }
    if (now > exam.endAt) throw new BadRequestException('The exam has ended');
    if (exam.batches.length === 0) {
      throw new ForbiddenException('You are not assigned to this exam');
    }

    if (existing) {
      if (existing.status === AttemptStatus.ABANDONED) {
        throw new ConflictException(
          'You left this exam. An exam cannot be entered again once you leave it.',
        );
      }
      if (existing.status === AttemptStatus.DENIED) {
        return this.prisma.attempt.update({
          where: { id: existing.id },
          data: {
            status: AttemptStatus.PENDING_APPROVAL,
            deniedAt: null,
            deniedById: null,
            denialReason: null,
          },
          select: { id: true, status: true, denialReason: true },
        });
      }
      // PENDING_APPROVAL / APPROVED / IN_PROGRESS / SUBMITTED / AUTO_SUBMITTED
      // — the poller just reads back whatever the row currently says.
      return existing;
    }

    try {
      return await this.prisma.attempt.create({
        data: {
          instituteId: student.instituteId,
          examId,
          studentId: student.id,
        },
        select: { id: true, status: true, denialReason: true },
      });
    } catch (err) {
      // A double-click / thundering-herd race can lose the `existing` check
      // above to a concurrent request; the @@unique([examId, studentId])
      // constraint is the real guard. Without this, the loser gets a bare
      // 500 instead of reading back what the winner created.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.attempt.findUniqueOrThrow({
          where: { examId_studentId: { examId, studentId: student.id } },
          select: { id: true, status: true, denialReason: true },
        });
      }
      throw err;
    }
  }

  /** Lightweight poll target for the entry-approval waiting screen. */
  async getEntry(attemptId: string) {
    const student = await this.currentStudent();
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, studentId: student.id },
      select: { id: true, status: true, denialReason: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  private adminCtx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { userId: ctx.userId, instituteId: ctx.instituteId };
  }

  /**
   * Students currently waiting on (or recently decided for) entry into one
   * exam (§ exam entry approval) — backs the admin's live approval queue.
   * IN_PROGRESS/SUBMITTED/etc. are excluded: once a student has begun, there
   * is nothing left for the admin to decide.
   */
  async listEntryRequests(examId: string) {
    const { instituteId } = this.adminCtx();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: { id: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.prisma.attempt.findMany({
      where: {
        examId,
        status: {
          in: [
            AttemptStatus.PENDING_APPROVAL,
            AttemptStatus.APPROVED,
            AttemptStatus.DENIED,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        denialReason: true,
        createdAt: true,
        approvedAt: true,
        deniedAt: true,
        student: {
          select: {
            id: true,
            rollNumber: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * Let a waiting student in. The student still must click Start Exam
   * themselves — approving does not start the clock (§ exam entry approval).
   */
  async approve(attemptId: string) {
    const { userId, instituteId } = this.adminCtx();
    const { count } = await this.prisma.attempt.updateMany({
      where: {
        id: attemptId,
        instituteId,
        status: AttemptStatus.PENDING_APPROVAL,
      },
      data: {
        status: AttemptStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });
    if (count === 0) {
      throw new ConflictException('This request is no longer pending');
    }
    return this.prisma.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { id: true, status: true },
    });
  }

  /** Decline a student's entry request, with an optional reason shown to them. */
  async deny(attemptId: string, reason?: string) {
    const { userId, instituteId } = this.adminCtx();
    const { count } = await this.prisma.attempt.updateMany({
      where: {
        id: attemptId,
        instituteId,
        status: AttemptStatus.PENDING_APPROVAL,
      },
      data: {
        status: AttemptStatus.DENIED,
        deniedAt: new Date(),
        deniedById: userId,
        denialReason: reason?.trim() || null,
      },
    });
    if (count === 0) {
      throw new ConflictException('This request is no longer pending');
    }
    return this.prisma.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { id: true, status: true, denialReason: true },
    });
  }

  /**
   * The server-controlled timer actually starts here — only once an admin
   * has approved entry AND the student clicks Start Exam. `startedAt`/
   * `expiresAt` are null before this runs; this is the one place that sets
   * them, so a stray reconnect or a page left open on the waiting screen can
   * never start the clock on the student's behalf.
   *
   * Deliberately conditioned on status at the DB level (same race guard as
   * submit()/abandon()): a double-click can't create two blank-response sets
   * for one attempt.
   */
  async begin(attemptId: string) {
    const student = await this.currentStudent();
    const attempt = await this.ensureOwned(attemptId, student.id);
    if (attempt.status !== AttemptStatus.APPROVED) {
      throw new ConflictException(
        attempt.status === AttemptStatus.PENDING_APPROVAL
          ? 'Waiting for admin approval before you can start this exam'
          : 'This attempt cannot be started from its current state',
      );
    }

    const exam = await this.prisma.exam.findUniqueOrThrow({
      where: { id: attempt.examId },
      select: {
        durationMinutes: true,
        endAt: true,
        questions: { select: { questionId: true } },
      },
    });

    const now = new Date();
    if (!exam.endAt || now > exam.endAt) {
      throw new BadRequestException('The exam has ended');
    }
    // Server-owned deadline: earlier of (now + duration) and the exam window end.
    const durationEnd = new Date(now.getTime() + exam.durationMinutes * 60_000);
    const expiresAt = durationEnd < exam.endAt ? durationEnd : exam.endAt;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.APPROVED },
        data: { status: AttemptStatus.IN_PROGRESS, startedAt: now, expiresAt },
      });
      if (count === 0) {
        throw new ConflictException(
          'This attempt cannot be started from its current state',
        );
      }
      await tx.response.createMany({
        data: exam.questions.map((eq) => ({
          attemptId,
          questionId: eq.questionId,
          instituteId: student.instituteId,
        })),
      });
    });

    // Same shaping as getState() — a freshly started attempt must arrive with
    // its diagrams resolved, not just their storage keys.
    return this.buildState(attemptId, student.instituteId);
  }

  async getState(attemptId: string) {
    const student = await this.currentStudent();
    const attempt = await this.ensureOwned(attemptId, student.id);
    if (PRE_START_ATTEMPT_STATUSES.includes(attempt.status)) {
      throw new BadRequestException('This attempt has not started yet');
    }
    await this.autoSubmitIfExpired(attemptId, student.id);
    return this.buildState(attemptId, student.instituteId);
  }

  async saveResponse(
    attemptId: string,
    questionId: string,
    dto: SaveResponseDto,
  ) {
    const student = await this.currentStudent();
    await this.getActiveAttempt(attemptId, student.id);

    const response = await this.prisma.response.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
    });
    if (!response) throw new NotFoundException('Question not in this attempt');

    /**
     * PARTIAL update. The two halves of a response — the answer and the
     * review flag — are saved by separate client actions ("select an option"
     * vs "save and mark for review"), so a field that is ABSENT from the
     * payload must be left alone.
     *
     * Treating an absent field as "clear it" silently destroyed answers: the
     * exam screen saves `{answer}` on option click and then `{markedForReview}`
     * on Save & Next, and the second call wiped the first. `null` still means
     * an explicit clear — only `undefined` preserves.
     */
    const isBlank = (v: unknown) =>
      v === null || v === undefined || (Array.isArray(v) && v.length === 0);

    const answerProvided = dto.answer !== undefined;
    const markProvided = dto.markedForReview !== undefined;

    const hasAnswer = answerProvided
      ? !isBlank(dto.answer)
      : !isBlank(response.answer);
    const marked = markProvided
      ? dto.markedForReview!
      : response.status === ResponseStatus.MARKED ||
        response.status === ResponseStatus.ANSWERED_MARKED;

    const updated = await this.prisma.response.update({
      where: { id: response.id },
      data: {
        ...(answerProvided
          ? {
              answer: hasAnswer
                ? (dto.answer as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            }
          : {}),
        status: this.computeStatus(hasAnswer, marked),
      },
      select: { questionId: true, status: true, answer: true },
    });

    /**
     * Accumulate the reported dwell time as a DELTA — the exam screen fires
     * autosaves it does not await, so two in flight together must sum rather
     * than overwrite (same reasoning as recordSectionTime).
     *
     * Raw SQL rather than Prisma's `increment`, which compiles to
     * `col = col + n`: this column is deliberately nullable so that "never
     * recorded" stays distinguishable from "answered in 0ms", and in SQL
     * `NULL + n` is NULL — an increment can never seed a null column. COALESCE
     * is what makes the first report land, and it is not expressible through
     * `increment`. Still one atomic statement, so concurrent saves still sum.
     */
    if (dto.timeSpentMs) {
      await this.prisma.$executeRaw`
        UPDATE "responses"
           SET "time_spent_ms" = COALESCE("time_spent_ms", 0) + ${dto.timeSpentMs}
         WHERE "id" = ${response.id}::uuid
      `;
    }

    return updated;
  }

  async submit(attemptId: string) {
    const student = await this.currentStudent();
    await this.getActiveAttempt(attemptId, student.id);
    // Conditioned on status at the DB level — closes the race against a
    // concurrent abandon()/another submit() for the same attempt. Whichever
    // write reaches Postgres first flips the status; the loser matches zero
    // rows here instead of silently clobbering the winner's outcome (see
    // abandon() below, which used to be able to delete a just-submitted
    // attempt's responses out from under it).
    const { count } = await this.prisma.attempt.updateMany({
      where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
      data: { status: AttemptStatus.SUBMITTED, submittedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException('This attempt is already submitted');
    }
    return this.summary(attemptId);
  }

  /**
   * Leave the exam without submitting (the Logout button on the exam screen).
   *
   * The candidate's work is DISCARDED — responses are deleted and the attempt
   * is never evaluated, because only a submitted attempt counts. The row is
   * kept in a terminal state so the exam still cannot be entered again: leaving
   * mid-exam spends the attempt, it does not hand back a second chance.
   */
  async abandon(attemptId: string) {
    const student = await this.currentStudent();
    await this.getActiveAttempt(attemptId, student.id);

    // Same race as submit(): claim the attempt with a status-conditioned
    // update FIRST, and only delete responses if that claim actually wins.
    // The previous version deleted responses unconditionally before the
    // status check, so a submit() landing between the delete and the update
    // (or an abandon() racing a submit()) could wipe a just-submitted
    // attempt's answers while it still read back as SUBMITTED.
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
        data: { status: AttemptStatus.ABANDONED, submittedAt: null },
      });
      if (count === 0) {
        throw new ConflictException('This attempt is already submitted');
      }
      await tx.response.deleteMany({ where: { attemptId } });
    });

    return { attemptId, status: AttemptStatus.ABANDONED };
  }

  /**
   * Accumulate time spent in a section (§2.8). The client reports elapsed
   * deltas periodically (e.g. on section change / heartbeat) and the server adds
   * them up; the Result engine folds the totals into the permanent record.
   */
  async recordSectionTime(attemptId: string, dto: RecordSectionTimeDto) {
    const student = await this.currentStudent();
    const attempt = await this.getActiveAttempt(attemptId, student.id);

    const section = await this.prisma.examSection.findFirst({
      where: { id: dto.sectionId, examId: attempt.examId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Section not in this exam');

    return this.prisma.attemptSectionTime.upsert({
      where: {
        attemptId_sectionId: { attemptId, sectionId: dto.sectionId },
      },
      create: {
        attemptId,
        sectionId: dto.sectionId,
        instituteId: student.instituteId,
        seconds: dto.seconds,
      },
      update: { seconds: { increment: dto.seconds } },
      select: { sectionId: true, seconds: true },
    });
  }

  /**
   * Record a proctoring violation (§2.2) reported by the exam client. Increments
   * the attempt's running count; when the exam's `maxViolations` threshold (> 0)
   * is reached, the attempt is auto-submitted and flagged for malpractice.
   */
  async reportViolation(attemptId: string, dto: ReportViolationDto) {
    const student = await this.currentStudent();
    const attempt = await this.getActiveAttempt(attemptId, student.id);
    const exam = await this.prisma.exam.findUnique({
      where: { id: attempt.examId },
      select: { maxViolations: true },
    });
    const maxViolations = exam?.maxViolations ?? 0;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.proctoringEvent.create({
        data: {
          attemptId,
          instituteId: student.instituteId,
          type: dto.type,
          detail: dto.detail,
        },
      });
      // Conditioned on status, same as submit()/abandon(): a concurrent
      // submit() landing between getActiveAttempt()'s check above and here
      // must not have its terminal status clobbered back to AUTO_SUBMITTED
      // by a violation reported around the same instant.
      await tx.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
        data: { violationCount: { increment: 1 } },
      });
      const current = await tx.attempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { violationCount: true, status: true },
      });
      const autoSubmitted =
        current.status === AttemptStatus.IN_PROGRESS &&
        maxViolations > 0 &&
        current.violationCount >= maxViolations;
      if (autoSubmitted) {
        await tx.attempt.updateMany({
          where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
          data: {
            status: AttemptStatus.AUTO_SUBMITTED,
            submittedAt: new Date(),
            flagged: true,
          },
        });
      }
      return { violationCount: current.violationCount, autoSubmitted };
    });

    return {
      violationCount: outcome.violationCount,
      maxViolations,
      warningsLeft:
        maxViolations > 0
          ? Math.max(0, maxViolations - outcome.violationCount)
          : null,
      autoSubmitted: outcome.autoSubmitted,
      flagged: outcome.autoSubmitted,
    };
  }

  async summary(attemptId: string) {
    const student = await this.currentStudent();
    const attempt = await this.ensureOwned(attemptId, student.id);

    const grouped = await this.prisma.response.groupBy({
      by: ['status'],
      where: { attemptId },
      _count: { _all: true },
    });
    const counts: Record<ResponseStatus, number> = {
      NOT_VISITED: 0,
      NOT_ANSWERED: 0,
      ANSWERED: 0,
      MARKED: 0,
      ANSWERED_MARKED: 0,
    };
    for (const row of grouped) counts[row.status] = row._count._all;

    return {
      attemptId,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      answered: counts.ANSWERED + counts.ANSWERED_MARKED,
      markedForReview: counts.MARKED + counts.ANSWERED_MARKED,
      notAnswered: counts.NOT_ANSWERED,
      notVisited: counts.NOT_VISITED,
    };
  }

  private computeStatus(hasAnswer: boolean, marked: boolean): ResponseStatus {
    if (hasAnswer && marked) return ResponseStatus.ANSWERED_MARKED;
    if (hasAnswer) return ResponseStatus.ANSWERED;
    if (marked) return ResponseStatus.MARKED;
    return ResponseStatus.NOT_ANSWERED;
  }

  /**
   * Turn a `stateSelect` row into the candidate-facing exam state: resolve each
   * question's stored media keys into fetchable URLs and compute the remaining
   * time from the server's own deadline.
   *
   * Shared by BOTH paths that hand a candidate their paper — `start()` and
   * `getState()`. It exists as one function because it did not: `start()` used
   * to spread the raw row and add only `remainingSeconds`, so a freshly started
   * attempt arrived with `mediaKeys` but no resolved `media`. The exam runner
   * reads `question.media`, so every diagram rendered as nothing for the whole
   * attempt — on the one code path every candidate takes.
   */
  private shapeState(attempt: AttemptStateRow) {
    return {
      ...attempt,
      exam: {
        ...attempt.exam,
        sections: attempt.exam.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => ({
            ...q,
            question: {
              ...q.question,
              media: this.mediaUrls(q.question.mediaKeys),
            },
          })),
        })),
      },
      // Non-null: shapeState() only ever runs on an attempt that has begun
      // (begin()/getState() both guard PRE_START_ATTEMPT_STATUSES first),
      // and begin() sets expiresAt in the same write that sets IN_PROGRESS.
      remainingSeconds: Math.max(
        0,
        Math.floor((attempt.expiresAt!.getTime() - Date.now()) / 1000),
      ),
    };
  }

  private async buildState(attemptId: string, instituteId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, instituteId },
      select: stateSelect,
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return this.shapeState(attempt);
  }

  private async ensureOwned(attemptId: string, studentId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, studentId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  /** Returns the attempt only if it's live; auto-submits (and rejects) if expired. */
  private async getActiveAttempt(attemptId: string, studentId: string) {
    const attempt = await this.ensureOwned(attemptId, studentId);
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This attempt is already submitted');
    }
    // Non-null: IN_PROGRESS is only ever reached via begin(), which sets
    // expiresAt in the same write.
    if (new Date() > attempt.expiresAt!) {
      // Conditioned on status, same as submit()/abandon(): a concurrent
      // submit() landing between the read above and this write must not be
      // clobbered back to AUTO_SUBMITTED with a wrong submittedAt.
      await this.prisma.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
        data: { status: AttemptStatus.AUTO_SUBMITTED, submittedAt: new Date() },
      });
      throw new BadRequestException(
        'Time is up — the attempt was auto-submitted',
      );
    }
    return attempt;
  }

  private async autoSubmitIfExpired(attemptId: string, studentId: string) {
    const attempt = await this.ensureOwned(attemptId, studentId);
    if (
      attempt.status === AttemptStatus.IN_PROGRESS &&
      new Date() > attempt.expiresAt!
    ) {
      // Conditioned on status, same as submit()/abandon(): a concurrent
      // submit() landing between the read above and this write must not be
      // clobbered back to AUTO_SUBMITTED with a wrong submittedAt.
      await this.prisma.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
        data: { status: AttemptStatus.AUTO_SUBMITTED, submittedAt: new Date() },
      });
    }
  }
}
