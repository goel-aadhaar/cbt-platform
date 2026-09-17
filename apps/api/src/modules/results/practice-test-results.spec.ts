import { BadRequestException } from '@nestjs/common';

import { ResultsService } from './results.service';

/**
 * A Practice Test hands each candidate their score the moment they submit
 * (§ Product Structure), with no release step in between. That promise only
 * holds if nothing can take the score back afterwards — so holding results is
 * refused for that kind, while a CBT, whose results are released deliberately,
 * keeps both publish and hold.
 */
describe('holding results', () => {
  const INSTITUTE = 'inst-1';

  function build(kind: 'MOCK_TEST' | 'ASSESSMENT') {
    const prisma = {
      exam: { findFirst: jest.fn(() => ({ id: 'e1', title: 'Paper', kind })) },
      result: { updateMany: jest.fn(() => ({ count: 3 })) },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u1' })),
      getInstituteId: jest.fn(() => INSTITUTE),
    };
    const teacherScope = { myBatchIds: jest.fn(() => Promise.resolve(null)) };
    const service = new ResultsService(
      prisma as never,
      tenant as never,
      teacherScope as never,
    );
    return { prisma, service };
  }

  it('refuses to hold a Practice Test, leaving every result published', async () => {
    const { prisma, service } = build('ASSESSMENT');

    await expect(service.hold('e1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.result.updateMany).not.toHaveBeenCalled();
  });

  it('still holds a CBT, which is released on purpose', async () => {
    const { prisma, service } = build('MOCK_TEST');

    await expect(service.hold('e1')).resolves.toEqual({ held: 3 });
    expect(prisma.result.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { published: false, publishedAt: null },
      }),
    );
  });

  it('publishes a Practice Test without complaint — that direction is safe', async () => {
    // Publish is idempotent here (the rows are already published), and
    // refusing it would break the admin's bulk "publish everything" path.
    const { service } = build('ASSESSMENT');

    await expect(service.publish('e1')).resolves.toEqual({ published: 3 });
  });
});
