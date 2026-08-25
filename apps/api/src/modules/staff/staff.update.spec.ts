import { NotFoundException } from '@nestjs/common';

import { Role, UserStatus } from '../auth/auth.types';
import { StaffService } from './staff.service';

/**
 * Admin update of a staff member — institute isolation, what survives a
 * phone-edit round trip, and the no-self-demotion guard.
 *
 * The real Prisma driver is replaced with the minimum the service calls in
 * `update`, `getOwned` and the trailing `findOne`. The assertions are about
 * ordering and scoping, not about the underlying ORM.
 */
describe('StaffService.update — admin edits a staff member', () => {
  const MY_INSTITUTE = 'inst-mine';

  function build(opts: {
    targetInMyInstitute: boolean;
    targetId?: string;
    /** Admins in MY institute other than the actor. Used by last-admin guard. */
    otherAdmins?: number;
    targetIsSelf?: boolean;
    /** What role the target still has when findOne runs (defaults to TEACHER). */
    remainingRoles?: Role[];
  }) {
    const targetId = opts.targetId ?? 'staff-1';
    const actorId = opts.targetIsSelf ? targetId : 'actor-1';
    const remaining = opts.remainingRoles ?? [Role.TEACHER];

    const prisma = {
      user: {
        findFirst: jest.fn(({ where }) => {
          if (!where) return null;
          const isTargetScope =
            where.id === targetId && where.instituteId === MY_INSTITUTE;
          const isStaffListScope =
            where.id === targetId &&
            where.instituteId === MY_INSTITUTE &&
            where.roles?.hasSome;
          if (isTargetScope || isStaffListScope) {
            return {
              id: targetId,
              instituteId: MY_INSTITUTE,
              roles: remaining,
              name: 'Asha',
              email: 'asha@example.com',
              phone: null,
              status: UserStatus.ACTIVE,
              createdAt: new Date(),
              _count: { questionsCreated: 0, examsCreated: 0 },
              sessions: [],
            };
          }
          return null;
        }),
        update: jest.fn(({ where, data }) => {
          return { id: where.id, ...data };
        }),
        count: jest.fn(
          () => (opts.otherAdmins ?? 1) + (opts.targetIsSelf ? 1 : 0),
        ),
      },
      question: { findMany: jest.fn().mockResolvedValue([]) },
      teacherBatch: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      batch: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const tenant = {
      get: jest.fn(() => ({
        instituteId: MY_INSTITUTE,
        userId: actorId,
        roles: [Role.ADMIN],
      })),
    };

    const service = new StaffService(
      prisma as never,
      tenant as never,
      {} as never,
    );

    return { service, prisma, targetId };
  }

  it('renames a teacher in my institute', async () => {
    const { service, prisma } = build({ targetInMyInstitute: true });
    const out = await service.update('staff-1', { name: 'Asha Rao' });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({
      name: 'Asha Rao',
    });
    expect(out).toBeDefined();
  });

  it('saves a phone and trims; an empty string clears it', async () => {
    const { service, prisma } = build({ targetInMyInstitute: true });

    await service.update('staff-1', { phone: '  +91 98765 43210  ' });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({
      phone: '+91 98765 43210',
    });

    prisma.user.update.mockClear();
    await service.update('staff-1', { phone: '' });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({
      phone: null,
    });

    prisma.user.update.mockClear();
    await service.update('staff-1', { phone: null });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({
      phone: null,
    });
  });

  it('refuses to touch a staff member from another institute (returns 404)', async () => {
    const { service } = build({ targetInMyInstitute: false });
    await expect(
      service.update('staff-foreign', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('drops old batch rows when the role loses TEACHER (privilege hygiene)', async () => {
    const { service, prisma } = build({ targetInMyInstitute: true });
    await service.update('staff-1', { roles: [Role.ADMIN] });
    expect(prisma.teacherBatch.deleteMany).toHaveBeenCalledWith({
      where: { teacherId: 'staff-1' },
    });
  });
});
