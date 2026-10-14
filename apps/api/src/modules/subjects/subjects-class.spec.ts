import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { SubjectsService } from './subjects.service';

describe('SubjectsService - class hierarchy', () => {
  const INSTITUTE = 'inst-1';
  const CLASS_11 = 'class-11';
  const CLASS_12 = 'class-12';
  const ARCHIVED = 'class-old';
  const tenant = {
    getInstituteId: jest.fn(() => INSTITUTE),
    get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u1' })),
  };

  const classRow = (id: string, name: string) => ({
    id,
    name,
    isActive: true,
    programId: 'prog-1',
    program: { name: 'NEET' },
  });
  const row = (
    id: string,
    name: string,
    cls: ReturnType<typeof classRow> | null,
  ) => ({
    id,
    name,
    classId: cls?.id ?? null,
    class: cls,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  function build(opts: { clash?: unknown; existing?: unknown } = {}) {
    const classes: Record<string, { id: string; isActive: boolean }> = {
      [CLASS_11]: { id: CLASS_11, isActive: true },
      [CLASS_12]: { id: CLASS_12, isActive: true },
      [ARCHIVED]: { id: ARCHIVED, isActive: false },
    };
    const prisma = {
      class: {
        findFirst: jest.fn(({ where }) =>
          where.instituteId === INSTITUTE ? (classes[where.id] ?? null) : null,
        ),
      },
      subject: {
        findFirst: jest.fn().mockResolvedValue(opts.clash ?? null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }) =>
          Promise.resolve(
            row(
              'new',
              data.name,
              data.classId ? classRow(data.classId, 'C') : null,
            ),
          ),
        ),
        update: jest.fn(({ where, data }) =>
          Promise.resolve({
            ...(opts.existing as object),
            id: where.id,
            ...data,
          }),
        ),
      },
      raw: {
        $transaction: jest.fn(),
      },
    };
    return {
      prisma,
      service: new SubjectsService(prisma as never, tenant as never),
    };
  }

  describe('create', () => {
    it('allows the same name under a different class', async () => {
      const { service, prisma } = build();
      const out = await service.create({ name: 'Physics', classId: CLASS_11 });
      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { instituteId: INSTITUTE, classId: CLASS_11, name: 'Physics' },
      });
      expect(out.class).toEqual({
        id: CLASS_11,
        name: 'C',
        isActive: true,
        programId: 'prog-1',
        programName: 'NEET',
      });
    });

    it('409s on a duplicate in the same class', async () => {
      const { service, prisma } = build({ clash: { id: 'x' } });
      await expect(
        service.create({ name: 'Physics', classId: CLASS_12 }),
      ).rejects.toThrow("Subject 'Physics' already exists in this class");
      expect(prisma.subject.create).not.toHaveBeenCalled();
    });

    it('409s on a duplicate among subjects with no class', async () => {
      const { service, prisma } = build({ clash: { id: 'x' } });
      await expect(service.create({ name: 'Physics' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { instituteId: INSTITUTE, classId: null, name: 'Physics' },
      });
      await expect(service.create({ name: 'Physics' })).rejects.toThrow(
        "Subject 'Physics' already exists with no class",
      );
    });

    it('maps a unique-index race (P2002) to 409', async () => {
      const { service, prisma } = build();
      prisma.subject.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.create({ name: 'Physics', classId: CLASS_11 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a classless subject without touching classes', async () => {
      const { service, prisma } = build();
      await service.create({ name: 'Physics' });
      expect(prisma.class.findFirst).not.toHaveBeenCalled();
      expect(prisma.subject.create.mock.calls[0][0].data.classId).toBeNull();
    });

    it('404s on an unknown or other-institute class', async () => {
      const { service } = build();
      await expect(
        service.create({ name: 'Physics', classId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an archived class', async () => {
      const { service, prisma } = build();
      await expect(
        service.create({ name: 'Physics', classId: ARCHIVED }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.subject.create).not.toHaveBeenCalled();
    });
  });

  describe('update (move)', () => {
    const existing = row('s1', 'Physics', classRow(CLASS_11, 'Class 11'));

    function buildMove(clash?: unknown) {
      const ctx = build({ existing });
      ctx.prisma.subject.findFirst
        .mockReset()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(clash ?? null);
      return ctx;
    }

    it('moves to another class without touching question text', async () => {
      const { service, prisma } = buildMove();
      await service.update('s1', { classId: CLASS_12 });
      expect(prisma.subject.findFirst).toHaveBeenLastCalledWith({
        where: {
          instituteId: INSTITUTE,
          classId: CLASS_12,
          name: 'Physics',
          id: { not: 's1' },
        },
      });
      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { classId: CLASS_12 } }),
      );
      expect(prisma.raw.$transaction).not.toHaveBeenCalled();
    });

    it('409s when the name already exists in the target class', async () => {
      const { service, prisma } = buildMove({ id: 's2' });
      await expect(service.update('s1', { classId: CLASS_12 })).rejects.toThrow(
        "Subject 'Physics' already exists in this class",
      );
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    it('moves to no class with null', async () => {
      const { service, prisma } = buildMove();
      await service.update('s1', { classId: null });
      expect(prisma.class.findFirst).not.toHaveBeenCalled();
      expect(prisma.subject.findFirst).toHaveBeenLastCalledWith({
        where: expect.objectContaining({ classId: null, name: 'Physics' }),
      });
      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { classId: null } }),
      );
    });

    it('409s when moving to no class where the name is taken', async () => {
      const { service } = buildMove({ id: 's2' });
      await expect(service.update('s1', { classId: null })).rejects.toThrow(
        "Subject 'Physics' already exists with no class",
      );
    });

    it('refuses to move into an archived class', async () => {
      const { service } = buildMove();
      await expect(
        service.update('s1', { classId: ARCHIVED }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('leaves the class alone when classId is omitted', async () => {
      const { service, prisma } = buildMove();
      await service.update('s1', {});
      expect(prisma.subject.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.class.findFirst).not.toHaveBeenCalled();
    });

    it('checks a rename against the current class', async () => {
      const { service, prisma } = buildMove({ id: 's2' });
      await expect(
        service.update('s1', { name: 'Chemistry' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.subject.findFirst).toHaveBeenLastCalledWith({
        where: {
          instituteId: INSTITUTE,
          classId: CLASS_11,
          name: 'Chemistry',
          id: { not: 's1' },
        },
      });
    });
  });

  describe('findAll filters', () => {
    it('shapes the class payload with the program name', async () => {
      const { service, prisma } = build();
      prisma.subject.findMany.mockResolvedValueOnce([
        row('s1', 'Physics', classRow(CLASS_11, 'Class 11')),
        row('s2', 'Biology', null),
      ]);
      const out = await service.findAll();
      expect(out[0].class).toEqual({
        id: CLASS_11,
        name: 'Class 11',
        isActive: true,
        programId: 'prog-1',
        programName: 'NEET',
      });
      expect(out[1]).toMatchObject({ classId: null, class: null });
    });

    it('filters by classId', async () => {
      const { service, prisma } = build();
      await service.findAll({ classId: CLASS_11 });
      expect(prisma.subject.findMany.mock.calls[0][0].where).toEqual({
        instituteId: INSTITUTE,
        classId: CLASS_11,
      });
    });

    it('filters to subjects with no class', async () => {
      const { service, prisma } = build();
      await service.findAll({ noClass: true });
      expect(prisma.subject.findMany.mock.calls[0][0].where).toEqual({
        instituteId: INSTITUTE,
        classId: null,
      });
    });

    it('400s when both classId and noClass are given', async () => {
      const { service } = build();
      await expect(
        service.findAll({ classId: CLASS_11, noClass: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
