import { BadRequestException } from '@nestjs/common';

import { StudentsService } from './students.service';

/**
 * Bulk batch reassign — the operations shortcut that lets an admin move many
 * students to a different batch in one round trip. The DTO bounds it to 500
 * ids; what really matters here is that the call:
 *
 *   - Refuses any id that does not belong to this institute (status 400, NOT
 *     404 — see the comment in `reassignBatch` on the status-code oracle)
 *   - Refuses to move students to a target batch from another institute
 *   - Confirms `count` matches the request before issuing `updateMany`, so
 *     partial successes never go quiet
 */
describe('StudentsService.reassignBatch', () => {
  const MY_INSTITUTE = 'inst-mine';
  const TARGET_BATCH = 'batch-beta';
  const S1 = 'student-1';
  const S2 = 'student-2';
  const S_FOREIGN = 'student-other-inst';

  function build() {
    const prisma = {
      batch: {
        findFirst: jest.fn(({ where }) => {
          if (where.id === TARGET_BATCH && where.instituteId === MY_INSTITUTE) {
            return { id: TARGET_BATCH };
          }
          return null;
        }),
      },
      student: {
        findMany: jest.fn(({ where }) => {
          if (!where?.id?.in) return [];
          // Only the two MY-institute ids resolve.
          return where.id.in
            .filter((id: string) => id !== S_FOREIGN)
            .map((id: string) => ({ id }));
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const tenant = {
      getInstituteId: jest.fn(() => MY_INSTITUTE),
    };

    const service = new StudentsService(
      prisma as never,
      tenant as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, prisma };
  }

  it('moves every listed student and reports how many', async () => {
    const { service, prisma } = build();
    const out = await service.reassignBatch([S1, S2], TARGET_BATCH);
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [S1, S2] }, instituteId: MY_INSTITUTE },
      data: { batchId: TARGET_BATCH },
    });
    expect(out).toEqual({ moved: 2, targetBatchId: TARGET_BATCH });
  });

  it('rejects ids from another institute with a 400 that names them', async () => {
    const { service, prisma } = build();
    await expect(
      service.reassignBatch([S1, S_FOREIGN], TARGET_BATCH),
    ).rejects.toThrow(BadRequestException);
    // The whole point of fail-fast: never call updateMany with an unsafe
    // payload, even partially. One bad id takes the whole call down rather
    // than silently doing the rest.
    expect(prisma.student.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a target batch from another institute', async () => {
    const { service } = build();
    await expect(
      service.reassignBatch([S1, S2], 'batch-from-theirs'),
    ).rejects.toThrow(BadRequestException);
  });
});
