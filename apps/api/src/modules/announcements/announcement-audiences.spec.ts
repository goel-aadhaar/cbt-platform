import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AnnouncementsService } from './announcements.service';

/**
 * Who a notice may be addressed to, and who then sees it (§2.9).
 *
 * Two rules carry the feature and neither is visible from the row alone:
 *
 *  - Broadcasting to staff is an ADMIN action. A teacher keeps the ability
 *    they already had (notify their own students) and is refused the rest.
 *  - Narrowing is the ABSENCE of rows: no batches means every student, no
 *    teachers means every teacher. That inverts the usual "empty list = nobody"
 *    reading, so it is pinned here rather than left to be rediscovered.
 *
 * Mocks are minimal, matching exams.live.spec.ts — only the prisma calls these
 * paths actually make.
 */
describe('AnnouncementsService — audiences', () => {
  const INSTITUTE = 'inst-1';

  function build(role: 'ADMIN' | 'TEACHER') {
    const created: Record<string, unknown>[] = [];
    /** The filter listForMe() asked with — the behaviour under test. */
    let asked: { AND: { toTeachers?: boolean; OR?: unknown }[] } | null = null;
    const prisma = {
      announcement: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return { id: 'a-1', ...args.data };
        }),
        findMany: jest.fn((args: { where: typeof asked }) => {
          asked = args.where;
          return [];
        }),
        count: jest.fn(() => 0),
      },
      // Every id the specs pass is treated as real and in-tenant; the point
      // here is the audience rules, not the existence checks.
      batch: { findMany: jest.fn(({ where }: never) => idsOf(where)) },
      user: { findMany: jest.fn(({ where }: never) => idsOf(where)) },
      media: { findMany: jest.fn(() => []) },
      student: { findUnique: jest.fn(() => ({ batchId: 'batch-a' })) },
    };
    const tenant = {
      get: jest.fn(() => ({
        instituteId: INSTITUTE,
        userId: role === 'ADMIN' ? 'admin-1' : 'teacher-1',
        role,
      })),
    };
    // A teacher scoped to batch-a only; null for an admin (unrestricted).
    const teacherScope = {
      myBatchIds: jest.fn(() =>
        Promise.resolve(role === 'TEACHER' ? ['batch-a'] : null),
      ),
    };
    const service = new AnnouncementsService(
      prisma as never,
      tenant as never,
      teacherScope as never,
    );
    return { service, prisma, created, asked: () => asked };
  }

  /** Echo back the ids asked for, so existence checks always pass. */
  function idsOf(where: { id?: { in?: string[] } }) {
    return (where?.id?.in ?? []).map((id: string) => ({ id }));
  }

  const base = { title: 'Notice', body: 'Body' };

  describe('who may address teachers', () => {
    it('lets an admin send to teachers', async () => {
      const { service, created } = build('ADMIN');
      await service.create({ ...base, toTeachers: true });
      expect(created[0].toTeachers).toBe(true);
    });

    it('refuses a teacher who ticks the teachers audience', async () => {
      const { service } = build('TEACHER');
      await expect(
        service.create({ ...base, toTeachers: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a teacher who names teachers without ticking the box', async () => {
      // The flag and the list are two ways to reach the same audience;
      // guarding only the flag would leave the list as a way around it.
      const { service } = build('TEACHER');
      await expect(
        service.create({ ...base, teacherIds: ['teacher-2'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('still lets a teacher notify their own students', async () => {
      const { service, created } = build('TEACHER');
      await service.create({ ...base, batchIds: ['batch-a'] });
      expect(created[0].toStudents).toBe(true);
    });

    it('refuses a teacher targeting a batch they do not teach', async () => {
      const { service } = build('TEACHER');
      await expect(
        service.create({ ...base, batchIds: ['batch-z'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('a notice must reach someone', () => {
    it('refuses both audiences off', async () => {
      const { service } = build('ADMIN');
      await expect(
        service.create({ ...base, toStudents: false, toTeachers: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('defaults to students when nothing is said', async () => {
      const { service, created } = build('ADMIN');
      await service.create({ ...base });
      expect(created[0].toStudents).toBe(true);
      expect(created[0].toTeachers).toBe(false);
    });
  });

  describe('narrowing rows only follow their own audience', () => {
    it('drops batch rows on a teachers-only notice', async () => {
      // Otherwise they sit there inert and silently start applying the day
      // someone re-ticks Students.
      const { service, created } = build('ADMIN');
      await service.create({
        ...base,
        toStudents: false,
        toTeachers: true,
        batchIds: ['batch-a'],
      });
      expect(created[0].batches).toBeUndefined();
    });

    it('keeps teacher rows on a teachers notice', async () => {
      const { service, created } = build('ADMIN');
      await service.create({
        ...base,
        toTeachers: true,
        teacherIds: ['teacher-2'],
      });
      expect(created[0].teachers).toEqual({
        create: [{ teacherId: 'teacher-2', instituteId: INSTITUTE }],
      });
    });
  });

  describe('the recipient filter', () => {
    it('asks for teacher notices addressed to all or to me', async () => {
      const { service, asked } = build('TEACHER');
      await service.listForMe();
      const where = asked()!;
      expect(where.AND[0].toTeachers).toBe(true);
      expect(where.AND[0].OR).toEqual([
        { teachers: { none: {} } },
        { teachers: { some: { teacherId: 'teacher-1' } } },
      ]);
    });

    it('never shows a teacher a students-only notice', async () => {
      // toTeachers: true is asserted above; a students-only notice has it
      // false, so the same clause excludes it. Stated separately because it
      // is the property that actually matters.
      const { service, asked } = build('TEACHER');
      await service.listForMe();
      const where = asked()!;
      expect(where.AND[0]).not.toHaveProperty('toStudents');
      expect(where.AND[0].toTeachers).toBe(true);
    });
  });
});
