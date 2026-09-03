import { AssessmentClosureService } from './assessment-closure.service';
import { ExamKind, ExamStatus } from './exam.types';
import { AttemptStatus } from '../attempts/attempt.types';

/**
 * The automatic Assessment lifecycle (§ Assessments) — the sweep that
 * replaces "an admin clicks Evaluate/Publish" with "the window ended".
 * Mocks only what `closeOne`/`sweep` actually touch, following the same
 * in-memory-row style as attempts.entry-approval.spec.ts.
 */
describe('AssessmentClosureService', () => {
  const INSTITUTE = 'inst-1';
  const EXAM_ID = 'exam-1';
  const TEACHER_ID = 'teacher-1';

  function build(opts: {
    examStatus?: ExamStatus;
    autoClosedAt?: Date | null;
    inProgressAttempts?: number;
    evaluateShouldThrow?: boolean;
  }) {
    let examRow = {
      id: EXAM_ID,
      instituteId: INSTITUTE,
      createdById: TEACHER_ID,
      kind: ExamKind.ASSESSMENT,
      status: opts.examStatus ?? ExamStatus.PUBLISHED,
      autoClosedAt: opts.autoClosedAt ?? null,
      endAt: new Date(Date.now() - 1000),
    };

    const attemptUpdateMany = jest.fn(() => ({
      count: opts.inProgressAttempts ?? 0,
    }));

    const examUpdateMany = jest.fn(
      ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        if (where.id !== examRow.id) return { count: 0 };
        if (where.status && where.status !== examRow.status) {
          return { count: 0 };
        }
        examRow = { ...examRow, ...data };
        return { count: 1 };
      },
    );
    const examUpdate = jest.fn(({ data }: { data: object }) => {
      examRow = { ...examRow, ...data };
      return examRow;
    });

    // The sweep's own query filters by kind/endAt/autoClosedAt/status — the
    // mock mirrors that filter against the in-memory row rather than
    // returning it unconditionally, so a test that marks the row already
    // closed (`autoClosedAt` set) genuinely sees zero due rows, the same as
    // the real query would.
    const prisma = {
      exam: {
        findMany: jest.fn(() => {
          const dueByKindAndWindow =
            examRow.kind === ExamKind.ASSESSMENT &&
            examRow.endAt.getTime() <= Date.now() &&
            examRow.autoClosedAt === null &&
            (examRow.status === ExamStatus.PUBLISHED ||
              examRow.status === ExamStatus.ARCHIVED);
          if (!dueByKindAndWindow) return [];
          return [
            {
              id: examRow.id,
              instituteId: examRow.instituteId,
              createdById: examRow.createdById,
              status: examRow.status,
            },
          ];
        }),
        updateMany: examUpdateMany,
        update: examUpdate,
      },
      attempt: {
        updateMany: attemptUpdateMany,
      },
    };

    const evaluate = jest.fn(() => {
      if (opts.evaluateShouldThrow) throw new Error('DB hiccup');
      return { evaluated: 1, maxScore: 100, autoPublished: true };
    });

    const tenant = {
      run: jest.fn((_ctx: unknown, cb: () => unknown) => cb()),
    };

    const results = { evaluate };

    const service = new AssessmentClosureService(
      prisma as never,
      tenant as never,
      results as never,
    );

    return { service, prisma, tenant, evaluate, getExamRow: () => examRow };
  }

  it('closes a due, unclosed assessment: archives it, auto-submits in-flight attempts, and evaluates', async () => {
    const { service, getExamRow, evaluate, prisma } = build({
      inProgressAttempts: 3,
    });
    await service.sweep();

    expect(getExamRow().status).toBe(ExamStatus.ARCHIVED);
    expect(getExamRow().autoClosedAt).toBeInstanceOf(Date);
    expect(prisma.attempt.updateMany).toHaveBeenCalledWith({
      where: { examId: EXAM_ID, status: AttemptStatus.IN_PROGRESS },
      data: expect.objectContaining({ status: AttemptStatus.AUTO_SUBMITTED }),
    });
    // A window-close auto-submit is the same class of event as an
    // individual attempt's own lazy expiry, not malpractice — must not be
    // flagged the way a force-end or violation auto-submit is.
    const call = (prisma.attempt.updateMany as jest.Mock).mock.calls[0][0];
    expect(call.data.flagged).toBeUndefined();
    expect(evaluate).toHaveBeenCalledWith(EXAM_ID);
  });

  it('runs evaluate() inside a synthetic tenant context scoped to the exam institute', async () => {
    const { service, tenant } = build({});
    await service.sweep();
    expect(tenant.run).toHaveBeenCalledWith(
      expect.objectContaining({
        instituteId: INSTITUTE,
        isSuperadmin: false,
      }),
      expect.any(Function),
    );
  });

  it('is idempotent — a fully closed assessment (autoClosedAt set) is never processed again', async () => {
    const { service, evaluate, prisma } = build({
      examStatus: ExamStatus.ARCHIVED,
      autoClosedAt: new Date(),
    });
    await service.sweep();
    // The sweep query itself excludes autoClosedAt != null — this exam
    // never even comes back as "due", so nothing downstream should run.
    expect(evaluate).not.toHaveBeenCalled();
    expect(prisma.attempt.updateMany).not.toHaveBeenCalled();
  });

  it('a failed evaluate() leaves the exam retryable — archived, but NOT marked fully closed', async () => {
    const { service, getExamRow } = build({ evaluateShouldThrow: true });
    await expect(service.sweep()).resolves.toBeUndefined();
    // Archived immediately (stops accepting/showing attempts), but
    // autoClosedAt stays null specifically so the next sweep's query still
    // picks this row up and retries evaluate() — this is the actual retry
    // mechanism, not just "doesn't crash the sweep loop".
    expect(getExamRow().status).toBe(ExamStatus.ARCHIVED);
    expect(getExamRow().autoClosedAt).toBeNull();
  });

  it('retries a previously-failed evaluate() on the next sweep without re-archiving or re-auto-submitting', async () => {
    const first = build({ evaluateShouldThrow: true, inProgressAttempts: 2 });
    await first.service.sweep();
    expect(first.getExamRow().status).toBe(ExamStatus.ARCHIVED);
    expect(first.getExamRow().autoClosedAt).toBeNull();
    expect(first.prisma.attempt.updateMany).toHaveBeenCalledTimes(1);

    // Simulate the next tick: a fresh service instance over the SAME
    // (now-archived, still-open) row, this time with a working evaluate().
    const second = build({});
    // Carry the archived-but-unclosed state into the second sweep's fixture.
    (second.prisma.exam.findMany as jest.Mock).mockImplementationOnce(() => [
      {
        id: EXAM_ID,
        instituteId: INSTITUTE,
        createdById: TEACHER_ID,
        status: ExamStatus.ARCHIVED,
      },
    ]);
    await second.service.sweep();
    expect(second.evaluate).toHaveBeenCalledWith(EXAM_ID);
    expect(second.getExamRow().autoClosedAt).toBeInstanceOf(Date);
    // The archive-transition guard is `status: PUBLISHED`, which an
    // already-ARCHIVED row can never match again — so the retry path
    // cannot re-run the auto-submit step a second time.
    expect(second.prisma.attempt.updateMany).not.toHaveBeenCalled();
  });
  /**
   * The sweep must never reject.
   *
   * @nestjs/schedule does not await the cron callback, so a rejection escaping
   * sweep() is an unhandled rejection and Node terminates the process. This is
   * not hypothetical: a managed Postgres dropping an idle connection took the
   * whole API down mid-run, on a sweep that had no work to do.
   */
  it('survives the database being unreachable rather than crashing the process', async () => {
    const first = build({});
    (first.prisma.exam.findMany as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Connection terminated unexpectedly');
    });

    await expect(first.service.sweep()).resolves.toBeUndefined();
    // Nothing was closed, and nothing was half-closed either.
    expect(first.evaluate).not.toHaveBeenCalled();
    expect(first.prisma.attempt.updateMany).not.toHaveBeenCalled();
  });

  it('picks the work up again on the next tick', async () => {
    const first = build({});
    (first.prisma.exam.findMany as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Connection terminated unexpectedly');
    });
    await first.service.sweep();
    expect(first.getExamRow().autoClosedAt).toBeNull();

    // Same row, connection restored: the sweep closes it as normal.
    await first.service.sweep();
    expect(first.evaluate).toHaveBeenCalledWith(EXAM_ID);
    expect(first.getExamRow().autoClosedAt).toBeInstanceOf(Date);
  });
});
