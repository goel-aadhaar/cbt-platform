import { ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  const INSTITUTE = 'inst-1';
  const tenant = { getInstituteId: jest.fn(() => INSTITUTE) };

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'u1',
    name: 'Mechanics',
    subjectId: 's1',
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    _count: { chapters: 0 },
    ...over,
  });

  function build(prisma: Record<string, unknown>) {
    return new UnitsService(prisma as never, tenant as never);
  }

  describe('create', () => {
    it('creates a unit under a subject in the caller institute', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(row()),
        },
      };
      const out = await build(prisma).create({
        subjectId: 's1',
        name: 'Mechanics',
      });

      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', instituteId: INSTITUTE },
      });
      expect(prisma.unit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Mechanics', subjectId: 's1', instituteId: INSTITUTE },
        }),
      );
      expect(out).toMatchObject({ id: 'u1', chapterCount: 0 });
      expect(out).not.toHaveProperty('_count');
    });

    it('404s for a subject outside the institute', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue(null) },
        unit: { create: jest.fn() },
      };
      await expect(
        build(prisma).create({ subjectId: 'other', name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.unit.create).not.toHaveBeenCalled();
    });

    it('409s on a duplicate name within the subject', async () => {
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: {
          findFirst: jest.fn().mockResolvedValue(row()),
          create: jest.fn(),
        },
      };
      await expect(
        build(prisma).create({ subjectId: 's1', name: 'Mechanics' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.unit.create).not.toHaveBeenCalled();
    });

    it('409s when the unique index wins a race', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      const prisma = {
        subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
        unit: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(p2002),
        },
      };
      await expect(
        build(prisma).create({ subjectId: 's1', name: 'Mechanics' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('scopes to the institute, filters by subject and exposes chapterCount', async () => {
      const prisma = {
        unit: {
          findMany: jest
            .fn()
            .mockResolvedValue([row({ _count: { chapters: 3 } })]),
        },
      };
      const out = await build(prisma).findAll('s1');

      expect(prisma.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instituteId: INSTITUTE, subjectId: 's1' },
        }),
      );
      expect(out[0].chapterCount).toBe(3);
    });
  });

  describe('update', () => {
    it('renames a unit', async () => {
      const prisma = {
        unit: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(row())
            .mockResolvedValueOnce(null),
          update: jest.fn().mockResolvedValue(row({ name: 'Optics' })),
        },
      };
      const out = await build(prisma).update('u1', { name: 'Optics' });

      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Optics' } }),
      );
      expect(out.name).toBe('Optics');
    });

    it('409s when another unit in the subject has the name', async () => {
      const prisma = {
        unit: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(row())
            .mockResolvedValueOnce(row({ id: 'u2', name: 'Optics' })),
          update: jest.fn(),
        },
      };
      await expect(
        build(prisma).update('u1', { name: 'Optics' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.unit.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes an empty unit', async () => {
      const prisma = {
        unit: {
          findFirst: jest.fn().mockResolvedValue(row()),
          update: jest.fn().mockResolvedValue(row({ isActive: false })),
        },
      };
      await build(prisma).remove('u1');
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('refuses while the unit still has active chapters', async () => {
      const prisma = {
        unit: {
          findFirst: jest
            .fn()
            .mockResolvedValue(row({ _count: { chapters: 2 } })),
          update: jest.fn(),
        },
      };
      await expect(build(prisma).remove('u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.unit.update).not.toHaveBeenCalled();
    });
  });
});
