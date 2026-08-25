import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AttemptStatus } from './attempt.types';
import { AttemptsService } from './attempts.service';

/**
 * Exam entry approval: request → admin approve/deny → student begin.
 *
 * The mocks are intentionally minimal — only the prisma calls each method
 * actually makes — following the same in-memory-row style as
 * exams.live.spec.ts. `media` is never exercised: every mocked question
 * carries no mediaKeys, so `shapeState()`'s media resolution never calls it.
 */
describe('AttemptsService — exam entry approval', () => {
  const INSTITUTE = 'inst-mine';
  const FOREIGN_INSTITUTE = 'inst-theirs';
  const EXAM_ID = 'exam-1';
  const STUDENT_ID = 'student-1';
  const BATCH_ID = 'batch-1';
  const ATTEMPT_ID = 'attempt-1';
  const ADMIN_ID = 'admin-1';

  function build(opts: {
    attempt?: Partial<{
      status: AttemptStatus;
      instituteId: string;
      studentId: string;
      startedAt: Date | null;
      expiresAt: Date | null;
      denialReason: string | null;
    }>;
    /** No existing attempt row at all — the fresh-request path. */
    noAttempt?: boolean;
    examWindow?: { startAt: Date; endAt: Date };
    role?: 'STUDENT' | 'ADMIN';
  }) {
    const now = Date.now();
    const examRow = {
      id: EXAM_ID,
      instituteId: INSTITUTE,
      status: 'PUBLISHED',
      startAt: opts.examWindow?.startAt ?? new Date(now - 60_000),
      endAt: opts.examWindow?.endAt ?? new Date(now + 60 * 60_000),
      durationMinutes: 60,
      batches: [{ id: 'eb-1' }],
      questions: [{ questionId: 'q-1' }, { questionId: 'q-2' }],
    };

    let attemptRow: Record<string, unknown> | null = opts.noAttempt
      ? null
      : {
          id: ATTEMPT_ID,
          instituteId: INSTITUTE,
          examId: EXAM_ID,
          studentId: STUDENT_ID,
          status: AttemptStatus.PENDING_APPROVAL,
          startedAt: null,
          expiresAt: null,
          submittedAt: null,
          violationCount: 0,
          flagged: false,
          denialReason: null,
          approvedAt: null,
          approvedById: null,
          deniedAt: null,
          deniedById: null,
          // Only read by shapeState()/buildState() (via `stateSelect`), which
          // begin()/getState() reach post-guard — empty but shape-correct so
          // `attempt.exam.sections.map(...)` doesn't blow up on undefined.
          exam: {
            id: EXAM_ID,
            title: 'Live Demo',
            durationMinutes: 60,
            instructions: null,
            calculatorEnabled: false,
            fullscreenRequired: false,
            maxViolations: 0,
            sections: [] as unknown[],
          },
          responses: [] as unknown[],
          ...opts.attempt,
        };

    const responseCreateMany = jest.fn(() => ({ count: 2 }));

    /**
     * Shared status-conditioned update, matching the real `updateMany`
     * guard — reused by both the outer client and the `$transaction`
     * callback's `tx.attempt.updateMany`, since `begin()` runs its update
     * inside a transaction while `approve()`/`deny()` don't.
     */
    const attemptUpdateMany = ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      if (!attemptRow) return { count: 0 };
      if (where.id !== attemptRow.id) return { count: 0 };
      if (where.status && where.status !== attemptRow.status) {
        return { count: 0 };
      }
      if (where.instituteId && where.instituteId !== attemptRow.instituteId) {
        return { count: 0 };
      }
      attemptRow = { ...(attemptRow as object), ...data };
      return { count: 1 };
    };

    const prisma = {
      student: {
        findUnique: jest.fn(() => ({
          id: STUDENT_ID,
          instituteId: INSTITUTE,
          batchId: BATCH_ID,
        })),
      },
      exam: {
        // requestEntry() filters `batches` via a nested `select`, not
        // `where` — the batch-membership check lives there.
        findFirst: jest.fn(({ where, select }) => {
          if (where?.id === EXAM_ID && where.instituteId === INSTITUTE) {
            return {
              ...examRow,
              batches:
                select?.batches?.where?.batchId === BATCH_ID
                  ? examRow.batches
                  : [],
            };
          }
          return null;
        }),
        findUniqueOrThrow: jest.fn(({ where }) => {
          if (where?.id !== EXAM_ID) throw new Error('not found');
          return examRow;
        }),
      },
      attempt: {
        findUnique: jest.fn(() => attemptRow),
        findFirst: jest.fn(({ where }) => {
          if (!attemptRow) return null;
          if (where?.id && where.id !== attemptRow.id) return null;
          if (where?.studentId && where.studentId !== attemptRow.studentId) {
            return null;
          }
          if (
            where?.instituteId &&
            where.instituteId !== attemptRow.instituteId
          ) {
            return null;
          }
          return attemptRow;
        }),
        findUniqueOrThrow: jest.fn(() => {
          if (!attemptRow) throw new Error('not found');
          return attemptRow;
        }),
        create: jest.fn(({ data }) => {
          attemptRow = {
            id: ATTEMPT_ID,
            status: AttemptStatus.PENDING_APPROVAL,
            denialReason: null,
            ...data,
          };
          return attemptRow;
        }),
        update: jest.fn(({ data }) => {
          attemptRow = { ...(attemptRow as object), ...data };
          return attemptRow;
        }),
        updateMany: jest.fn(attemptUpdateMany),
        findMany: jest.fn(({ where }) => {
          if (where?.examId !== EXAM_ID) return [];
          if (where?.instituteId && where.instituteId !== INSTITUTE) return [];
          return attemptRow ? [attemptRow] : [];
        }),
      },
      response: {
        createMany: responseCreateMany,
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        fn({
          attempt: { updateMany: jest.fn(attemptUpdateMany) },
          response: { createMany: responseCreateMany },
        }),
      ),
    };

    const tenant = {
      get: jest.fn(() => ({
        instituteId: INSTITUTE,
        userId: opts.role === 'ADMIN' ? ADMIN_ID : 'user-1',
        role: opts.role ?? 'STUDENT',
      })),
    };

    const service = new AttemptsService(
      prisma as never,
      tenant as never,
      {} as never, // MediaStoragePort — never called (no mediaKeys in fixtures)
    );

    return { service, prisma, tenant, getAttemptRow: () => attemptRow };
  }

  describe('requestEntry()', () => {
    it('creates a fresh PENDING_APPROVAL attempt when none exists', async () => {
      const { service, getAttemptRow } = build({ noAttempt: true });
      const out = await service.requestEntry(EXAM_ID);
      expect(out.status).toBe(AttemptStatus.PENDING_APPROVAL);
      expect(getAttemptRow()?.status).toBe(AttemptStatus.PENDING_APPROVAL);
      expect(getAttemptRow()?.startedAt).toBeUndefined();
    });

    it('is idempotent — reading back an existing PENDING_APPROVAL row rather than erroring', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.PENDING_APPROVAL },
      });
      const out = await service.requestEntry(EXAM_ID);
      expect(out.status).toBe(AttemptStatus.PENDING_APPROVAL);
      expect(out.id).toBe(ATTEMPT_ID);
    });

    it('reopens a DENIED request back to PENDING_APPROVAL, clearing the denial fields', async () => {
      const { service, getAttemptRow } = build({
        attempt: {
          status: AttemptStatus.DENIED,
          denialReason: 'ID not verified',
        },
      });
      const out = await service.requestEntry(EXAM_ID);
      expect(out.status).toBe(AttemptStatus.PENDING_APPROVAL);
      expect(out.denialReason).toBeNull();
      expect(getAttemptRow()?.deniedAt).toBeNull();
      expect(getAttemptRow()?.deniedById).toBeNull();
    });

    it('refuses re-entry once the student has ABANDONED the exam', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.ABANDONED },
      });
      await expect(service.requestEntry(EXAM_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects before the exam window opens', async () => {
      const { service } = build({
        noAttempt: true,
        examWindow: {
          startAt: new Date(Date.now() + 60_000),
          endAt: new Date(Date.now() + 120_000),
        },
      });
      await expect(service.requestEntry(EXAM_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a student not assigned to the exam (wrong batch)', async () => {
      const { service, prisma } = build({ noAttempt: true });
      (prisma.student.findUnique as jest.Mock).mockReturnValueOnce({
        id: STUDENT_ID,
        instituteId: INSTITUTE,
        batchId: 'some-other-batch',
      });
      await expect(service.requestEntry(EXAM_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getEntry()', () => {
    it("returns the caller's own attempt", async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.APPROVED },
      });
      const out = await service.getEntry(ATTEMPT_ID);
      expect(out.status).toBe(AttemptStatus.APPROVED);
    });

    it("404s on another student's attempt", async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.APPROVED, studentId: 'someone-else' },
      });
      await expect(service.getEntry(ATTEMPT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('begin()', () => {
    it('starts the clock only from APPROVED, creating the blank responses', async () => {
      const { service, prisma, getAttemptRow } = build({
        attempt: { status: AttemptStatus.APPROVED },
      });
      const state = await service.begin(ATTEMPT_ID);
      expect(getAttemptRow()?.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(getAttemptRow()?.startedAt).toBeInstanceOf(Date);
      expect(getAttemptRow()?.expiresAt).toBeInstanceOf(Date);
      expect(prisma.response.createMany).toHaveBeenCalledTimes(1);
      expect(state.remainingSeconds).toBeGreaterThan(0);
    });

    it('refuses to start a PENDING_APPROVAL attempt', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.PENDING_APPROVAL },
      });
      await expect(service.begin(ATTEMPT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to start an already-IN_PROGRESS attempt (double-click race)', async () => {
      const { service } = build({
        attempt: {
          status: AttemptStatus.IN_PROGRESS,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await expect(service.begin(ATTEMPT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to start once the exam window has closed', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.APPROVED },
        examWindow: {
          startAt: new Date(Date.now() - 120_000),
          endAt: new Date(Date.now() - 1000),
        },
      });
      await expect(service.begin(ATTEMPT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getState() pre-start guard', () => {
    it.each([
      AttemptStatus.PENDING_APPROVAL,
      AttemptStatus.APPROVED,
      AttemptStatus.DENIED,
    ])('rejects reading full state while status is %s', async (status) => {
      const { service } = build({ attempt: { status } });
      await expect(service.getState(ATTEMPT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approve() / deny() — admin side', () => {
    it('approve() flips PENDING_APPROVAL to APPROVED and records the admin', async () => {
      const { service, getAttemptRow } = build({
        attempt: { status: AttemptStatus.PENDING_APPROVAL },
        role: 'ADMIN',
      });
      const out = await service.approve(ATTEMPT_ID);
      expect(out.status).toBe(AttemptStatus.APPROVED);
      expect(getAttemptRow()?.approvedById).toBe(ADMIN_ID);
      expect(getAttemptRow()?.approvedAt).toBeInstanceOf(Date);
    });

    it('approve() refuses a request that is no longer pending', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.APPROVED },
        role: 'ADMIN',
      });
      await expect(service.approve(ATTEMPT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it("approve() can't reach another institute's attempt", async () => {
      const { service } = build({
        attempt: {
          status: AttemptStatus.PENDING_APPROVAL,
          instituteId: FOREIGN_INSTITUTE,
        },
        role: 'ADMIN',
      });
      await expect(service.approve(ATTEMPT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deny() flips PENDING_APPROVAL to DENIED with the given reason', async () => {
      const { service, getAttemptRow } = build({
        attempt: { status: AttemptStatus.PENDING_APPROVAL },
        role: 'ADMIN',
      });
      const out = await service.deny(ATTEMPT_ID, 'Photo ID mismatch');
      expect(out.status).toBe(AttemptStatus.DENIED);
      expect(out.denialReason).toBe('Photo ID mismatch');
      expect(getAttemptRow()?.deniedById).toBe(ADMIN_ID);
    });

    it('deny() refuses a request that is no longer pending', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.DENIED },
        role: 'ADMIN',
      });
      await expect(service.deny(ATTEMPT_ID, 'again')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('listEntryRequests()', () => {
    it('404s for an exam outside the caller institute', async () => {
      const { service, prisma } = build({
        attempt: { status: AttemptStatus.PENDING_APPROVAL },
        role: 'ADMIN',
      });
      (prisma.exam.findFirst as jest.Mock).mockReturnValueOnce(null);
      await expect(service.listEntryRequests(EXAM_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lists the pending request for its exam', async () => {
      const { service } = build({
        attempt: { status: AttemptStatus.PENDING_APPROVAL },
        role: 'ADMIN',
      });
      const rows = await service.listEntryRequests(EXAM_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe(AttemptStatus.PENDING_APPROVAL);
    });
  });
});
