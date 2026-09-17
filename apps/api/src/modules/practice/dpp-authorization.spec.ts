import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { DppService } from './dpp.service';

/**
 * The guards DppService.create()/update() run before ever touching a DPP row
 * (§ Product Structure): a teacher may only share with batches they teach, a
 * DPP may only be built from APPROVED questions, and the subject/chapter it
 * is tagged with must actually belong together. Mirrors the mocking style
 * `resource-access.spec.ts` and `assessment-closure.service.spec.ts` use —
 * only the Prisma calls each guard actually makes.
 */
describe('DppService authorization', () => {
  const INSTITUTE = 'inst-1';

  function build(opts: {
    role?: 'ADMIN' | 'TEACHER';
    myBatchIds?: string[] | null;
    batchRows?: { id: string; name: string }[];
    questionRows?: { id: string; status: string }[];
    chapterRow?: { id: string } | null;
  }) {
    const prisma = {
      batch: {
        findMany: jest.fn(() => opts.batchRows ?? []),
      },
      question: {
        findMany: jest.fn(() => opts.questionRows ?? []),
      },
      chapter: {
        findFirst: jest.fn(() => opts.chapterRow ?? null),
      },
      dpp: {
        // Mirrors the OUTPUT shape a real `select: dppSelect` returns (a
        // resolved `batch` object per row), not the CREATE call's input
        // shape (`{ create: [...] }`) — `shape()` maps over the former.
        create: jest.fn(() => ({
          id: 'dpp-1',
          batches: (opts.batchRows ?? []).map((b) => ({ batch: b })),
        })),
        findFirst: jest.fn(),
      },
    };
    const tenant = {
      get: jest.fn(() => ({
        instituteId: INSTITUTE,
        userId: 'user-1',
        role: opts.role ?? 'ADMIN',
      })),
    };
    const teacherScope = {
      myBatchIds: jest.fn(() =>
        Promise.resolve(
          opts.role === 'TEACHER' ? (opts.myBatchIds ?? []) : null,
        ),
      ),
    };
    const service = new DppService(
      prisma as never,
      tenant as never,
      teacherScope as never,
    );
    return { service, prisma, teacherScope };
  }

  /** Reaches the private assertCanPublishTo/assertQuestions/assertHierarchy
   * guards through the one public method that chains all three. */
  function create(
    service: DppService,
    overrides: Record<string, unknown> = {},
  ) {
    return service.create({
      title: 'Plant Kingdom P1 DPP',
      questionIds: ['q-1'],
      batchIds: ['batch-a'],
      ...overrides,
    });
  }

  describe('batch authorization', () => {
    it('lets an admin share with any batch in the institute', async () => {
      const { service } = build({
        role: 'ADMIN',
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(create(service)).resolves.toBeDefined();
    });

    it('lets a teacher share with a batch they teach', async () => {
      const { service } = build({
        role: 'TEACHER',
        myBatchIds: ['batch-a'],
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(create(service)).resolves.toBeDefined();
    });

    it('refuses a batch the teacher does not teach', async () => {
      const { service } = build({
        role: 'TEACHER',
        myBatchIds: ['batch-b'], // teaches Beta, not Alpha
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(create(service)).rejects.toThrow(ForbiddenException);
    });

    it('refuses the whole request when only ONE batch is unauthorized', async () => {
      const { service, prisma } = build({
        role: 'TEACHER',
        myBatchIds: ['batch-a'],
        batchRows: [
          { id: 'batch-a', name: 'Alpha' },
          { id: 'batch-b', name: 'Beta' },
        ],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(
        create(service, { batchIds: ['batch-a', 'batch-b'] }),
      ).rejects.toThrow(ForbiddenException);
      // All or nothing — a partial share would silently drop half of what
      // the teacher asked for.
      expect(prisma.dpp.create).not.toHaveBeenCalled();
    });

    it('refuses everything when a teacher has no batches at all', async () => {
      const { service } = build({
        role: 'TEACHER',
        myBatchIds: [],
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(create(service)).rejects.toThrow(ForbiddenException);
    });

    it('refuses a batch id that does not exist in this institute', async () => {
      const { service } = build({
        role: 'ADMIN',
        batchRows: [], // the requested id was not found
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(create(service)).rejects.toThrow(BadRequestException);
    });
  });

  describe('question eligibility', () => {
    it('refuses a question that is not APPROVED', async () => {
      const { service } = build({
        role: 'ADMIN',
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'DRAFT' }],
      });
      await expect(create(service)).rejects.toThrow(BadRequestException);
    });

    it('refuses a question id from another institute (or nonexistent)', async () => {
      const { service } = build({
        role: 'ADMIN',
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [], // the requested id was not found in this institute
      });
      await expect(create(service)).rejects.toThrow(BadRequestException);
    });
  });

  describe('subject/chapter hierarchy', () => {
    it('refuses a chapter that does not belong to the given subject', async () => {
      const { service } = build({
        role: 'ADMIN',
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
        chapterRow: null, // findFirst({subjectId, id}) found nothing
      });
      await expect(
        create(service, { subjectId: 'subj-1', chapterId: 'chap-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a chapter that does belong to the given subject', async () => {
      const { service } = build({
        role: 'ADMIN',
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
        chapterRow: { id: 'chap-1' },
      });
      await expect(
        create(service, { subjectId: 'subj-1', chapterId: 'chap-1' }),
      ).resolves.toBeDefined();
    });

    it('skips the hierarchy check entirely when no subject/chapter is given', async () => {
      const { service, prisma } = build({
        role: 'ADMIN',
        batchRows: [{ id: 'batch-a', name: 'Alpha' }],
        questionRows: [{ id: 'q-1', status: 'APPROVED' }],
      });
      await expect(create(service)).resolves.toBeDefined();
      expect(prisma.chapter.findFirst).not.toHaveBeenCalled();
    });
  });
});
