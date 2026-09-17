import { BadRequestException } from '@nestjs/common';

import { BatchesService } from './batches.service';
import { ClassesService } from '../classes/classes.service';
import { ProgramsService } from '../programs/programs.service';

/**
 * Archiving is reversible and delete is not — this pins both halves of that
 * (§ QA: "archived items should offer Unarchive and Delete").
 *
 * The delete guards matter more than they look. Every relation below these
 * three rows cascades (Program → Class → Batch → Student → attempts and
 * results), so a `delete()` that ran unguarded would destroy candidate
 * history without ever naming what it was about to take. These tests are
 * what keep that path refused while anything still points at the row.
 */
describe('archive lifecycle', () => {
  const INSTITUTE = 'inst-1';

  function tenantStub() {
    return {
      getInstituteId: jest.fn(() => INSTITUTE),
      get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u1' })),
    };
  }

  describe('unarchive', () => {
    it('restores a batch by setting isActive back to true', async () => {
      const prisma = {
        batch: {
          findFirst: jest.fn(() => ({ id: 'b1', isActive: false })),
          update: jest.fn(() => ({ id: 'b1', isActive: true })),
        },
      };
      const service = new BatchesService(
        prisma as never,
        tenantStub() as never,
      );

      await service.update('b1', { isActive: true });

      expect(prisma.batch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
    });

    it('leaves isActive alone when only a rename was asked for', async () => {
      // A rename must never quietly resurrect an archived row.
      const prisma = {
        batch: {
          findFirst: jest.fn(() => ({ id: 'b1', isActive: false })),
          update: jest.fn(() => ({ id: 'b1' })),
        },
      };
      const service = new BatchesService(
        prisma as never,
        tenantStub() as never,
      );

      await service.update('b1', { name: 'Beta' });

      expect(prisma.batch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Beta' } }),
      );
    });
  });

  describe('permanent delete — batch', () => {
    function buildBatch(counts: number[]) {
      const prisma = {
        batch: {
          findFirst: jest.fn(() => ({ id: 'b1' })),
          delete: jest.fn(() => ({ id: 'b1' })),
        },
        student: { count: jest.fn() },
        examBatch: { count: jest.fn() },
        dppBatch: { count: jest.fn() },
        resourceBatch: { count: jest.fn() },
        announcementBatch: { count: jest.fn() },
        teacherBatch: { count: jest.fn() },
        $transaction: jest.fn(() => Promise.resolve(counts)),
      };
      return {
        prisma,
        service: new BatchesService(prisma as never, tenantStub() as never),
      };
    }

    it('deletes a batch nothing points at', async () => {
      const { prisma, service } = buildBatch([0, 0, 0, 0, 0, 0]);

      await expect(service.destroy('b1')).resolves.toEqual({
        id: 'b1',
        deleted: true,
      });
      expect(prisma.batch.delete).toHaveBeenCalled();
    });

    it('refuses while students are enrolled, and does not delete', async () => {
      const { prisma, service } = buildBatch([3, 0, 0, 0, 0, 0]);

      await expect(service.destroy('b1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.batch.delete).not.toHaveBeenCalled();
    });

    it('refuses for a non-student reference too, such as an exam', async () => {
      // Deleting here would not lose candidates, but it would silently
      // un-assign a paper from a batch that was scheduled to sit it.
      const { prisma, service } = buildBatch([0, 1, 0, 0, 0, 0]);

      await expect(service.destroy('b1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.batch.delete).not.toHaveBeenCalled();
    });

    it('names every blocker so the admin knows what to clear first', async () => {
      const { service } = buildBatch([2, 1, 0, 0, 0, 0]);

      await expect(service.destroy('b1')).rejects.toThrow(
        /2 student\(s\).*1 exam assignment\(s\)/,
      );
    });
  });

  describe('permanent delete — class and program', () => {
    it('refuses to delete a class that still has batches', async () => {
      const prisma = {
        class: {
          findFirst: jest.fn(() => ({ id: 'c1' })),
          delete: jest.fn(),
        },
        batch: { count: jest.fn(() => 2) },
      };
      const service = new ClassesService(
        prisma as never,
        tenantStub() as never,
      );

      await expect(service.destroy('c1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.class.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty class', async () => {
      const prisma = {
        class: {
          findFirst: jest.fn(() => ({ id: 'c1' })),
          delete: jest.fn(() => ({ id: 'c1' })),
        },
        batch: { count: jest.fn(() => 0) },
      };
      const service = new ClassesService(
        prisma as never,
        tenantStub() as never,
      );

      await expect(service.destroy('c1')).resolves.toEqual({
        id: 'c1',
        deleted: true,
      });
    });

    it('refuses to delete a program an exam still references', async () => {
      const prisma = {
        program: {
          findFirst: jest.fn(() => ({ id: 'p1' })),
          delete: jest.fn(),
        },
        class: { count: jest.fn() },
        exam: { count: jest.fn() },
        $transaction: jest.fn(() => Promise.resolve([0, 4])),
      };
      const service = new ProgramsService(
        prisma as never,
        tenantStub() as never,
      );

      await expect(service.destroy('p1')).rejects.toThrow(/4 exam\(s\)/);
      expect(prisma.program.delete).not.toHaveBeenCalled();
    });
  });
});
