import { BadRequestException, ConflictException } from '@nestjs/common';

import { ChaptersService } from './chapters.service';

describe('ChaptersService', () => {
  const INSTITUTE = 'inst-1';
  const tenant = {
    getInstituteId: jest.fn(() => INSTITUTE),
    get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u1' })),
  };

  const chapter = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Kinematics',
    subjectId: 's1',
    unitId: null,
    unit: null,
    isActive: true,
    ...over,
  });

  function build(prisma: Record<string, unknown>) {
    return new ChaptersService(prisma as never, tenant as never);
  }

  describe('unit assignment', () => {
    it('creates a chapter inside a unit of the same subject', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u1',
            subjectId: 's1',
            isActive: true,
          }),
        },
        chapter: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(chapter({ unitId: 'u1' })),
        },
      };
      await build(prisma).create({
        subjectId: 's1',
        unitId: 'u1',
        name: 'Kinematics',
      });
      expect(prisma.chapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Kinematics',
            subjectId: 's1',
            unitId: 'u1',
            instituteId: INSTITUTE,
          },
        }),
      );
    });

    it('still creates a chapter with no unit', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: { findFirst: jest.fn() },
        chapter: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(chapter()),
        },
      };
      await build(prisma).create({ subjectId: 's1', name: 'Kinematics' });
      expect(prisma.unit.findFirst).not.toHaveBeenCalled();
      expect(prisma.chapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitId: null }),
        }),
      );
    });

    it('rejects a unit from a different subject with 400', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u9',
            subjectId: 's2',
            isActive: true,
          }),
        },
        chapter: { findFirst: jest.fn(), create: jest.fn() },
      };
      await expect(
        build(prisma).create({ subjectId: 's1', unitId: 'u9', name: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.chapter.create).not.toHaveBeenCalled();
    });

    it('rejects a unit outside the institute with 400', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: { findFirst: jest.fn().mockResolvedValue(null) },
        chapter: { findFirst: jest.fn(), create: jest.fn() },
      };
      await expect(
        build(prisma).create({ subjectId: 's1', unitId: 'nope', name: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('moves a chapter to a unit in its own subject, leaving the subject alone', async () => {
      const prisma = {
        unit: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u2',
            subjectId: 's1',
            isActive: true,
          }),
        },
        chapter: {
          findFirst: jest.fn().mockResolvedValue(chapter()),
          update: jest.fn().mockResolvedValue(chapter({ unitId: 'u2' })),
        },
      };
      await build(prisma).update('c1', { unitId: 'u2' });
      expect(prisma.chapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unitId: 'u2' } }),
      );
    });

    it('refuses to move a chapter to a unit of another subject', async () => {
      const prisma = {
        unit: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u9',
            subjectId: 's2',
            isActive: true,
          }),
        },
        chapter: {
          findFirst: jest.fn().mockResolvedValue(chapter()),
          update: jest.fn(),
        },
      };
      await expect(
        build(prisma).update('c1', { unitId: 'u9' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.chapter.update).not.toHaveBeenCalled();
    });

    it('detaches with unitId: null without validating a unit', async () => {
      const prisma = {
        unit: { findFirst: jest.fn() },
        chapter: {
          findFirst: jest.fn().mockResolvedValue(chapter({ unitId: 'u1' })),
          update: jest.fn().mockResolvedValue(chapter()),
        },
      };
      await build(prisma).update('c1', { unitId: null });
      expect(prisma.unit.findFirst).not.toHaveBeenCalled();
      expect(prisma.chapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unitId: null } }),
      );
    });

    it('leaves the unit alone when the field is absent', async () => {
      const prisma = {
        chapter: {
          findFirst: jest.fn().mockResolvedValue(chapter({ unitId: 'u1' })),
          update: jest.fn().mockResolvedValue(chapter()),
        },
      };
      await build(prisma).update('c1', {});
      expect(prisma.chapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
    });
  });

  describe('findAll', () => {
    const prismaWith = () => ({
      chapter: { findMany: jest.fn().mockResolvedValue([]) },
    });

    it('filters by unitId', async () => {
      const prisma = prismaWith();
      await build(prisma).findAll('s1', 'u1');
      expect(prisma.chapter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instituteId: INSTITUTE, subjectId: 's1', unitId: 'u1' },
        }),
      );
    });

    it('lists chapters with no unit when unassigned', async () => {
      const prisma = prismaWith();
      await build(prisma).findAll('s1', undefined, true);
      expect(prisma.chapter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instituteId: INSTITUTE, subjectId: 's1', unitId: null },
        }),
      );
    });

    it('rejects unitId together with unassigned', () => {
      expect(() => build(prismaWith()).findAll('s1', 'u1', true)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('rename', () => {
    function withTx(clash: unknown = null) {
      const tx = {
        $executeRaw: jest.fn(),
        chapter: {
          update: jest.fn().mockResolvedValue(chapter({ name: 'Motion' })),
        },
        question: { updateMany: jest.fn().mockResolvedValue({ count: 4 }) },
      };
      const prisma = {
        chapter: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(chapter())
            .mockResolvedValueOnce(clash),
          update: jest.fn().mockResolvedValue(chapter()),
        },
        raw: {
          $executeRaw: jest.fn(),
          $transaction: jest.fn((cb: (t: typeof tx) => unknown) =>
            Promise.resolve(cb(tx)),
          ),
        },
      };
      return { tx, prisma };
    }

    it('resyncs the denormalised chapter text on questions', async () => {
      const { tx, prisma } = withTx();
      await build(prisma).update('c1', { name: 'Motion' });
      expect(tx.question.updateMany).toHaveBeenCalledWith({
        where: { chapterId: 'c1' },
        data: { chapter: 'Motion' },
      });
    });

    it('does not touch questions when the name is unchanged', async () => {
      const { tx, prisma } = withTx();
      await build(prisma).update('c1', { name: 'Kinematics' });
      expect(tx.question.updateMany).not.toHaveBeenCalled();
    });

    it('409s on a clash and writes nothing', async () => {
      const { tx, prisma } = withTx(chapter({ id: 'c2', name: 'Motion' }));
      await expect(
        build(prisma).update('c1', { name: 'Motion' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.question.updateMany).not.toHaveBeenCalled();
    });
  });
});
