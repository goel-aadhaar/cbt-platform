import { ForbiddenException } from '@nestjs/common';

import { SubjectsService } from './subjects.service';

describe('SubjectsService.findAllWithCounts', () => {
  const INSTITUTE = 'inst-1';
  const tenant = { getInstituteId: jest.fn(() => INSTITUTE) };

  const subject = (id: string, name: string) => ({
    id,
    name,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  function build(over: Record<string, unknown> = {}) {
    const prisma = {
      subject: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            subject('s1', 'Biology'),
            subject('s2', 'Chemistry'),
            subject('s3', 'Physics'),
          ]),
      },
      unit: {
        groupBy: jest.fn().mockResolvedValue([
          { subjectId: 's1', _count: { _all: 2 } },
          { subjectId: 's2', _count: { _all: 1 } },
        ]),
      },
      chapter: {
        groupBy: jest.fn().mockResolvedValue([
          { subjectId: 's1', _count: { _all: 3 } },
          { subjectId: 's2', _count: { _all: 1 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          { subjectId: 's1', _count: { topics: 4 } },
          { subjectId: 's1', _count: { topics: 6 } },
          { subjectId: 's1', _count: { topics: 0 } },
          { subjectId: 's2', _count: { topics: 5 } },
        ]),
      },
      ...over,
    };
    return {
      prisma,
      service: new SubjectsService(prisma as never, tenant as never),
    };
  }

  it('attaches per-subject counts, summing topics across chapters', async () => {
    const { service } = build();
    const out = await service.findAllWithCounts();

    expect(out.map((s) => [s.name, s.counts])).toEqual(
      [
        ['Biology', { units: 2, chapters: 3, topics: 10 }],
        ['Chemistry', { units: 1, chapters: 1, topics: 5 }],
      ].concat([['Physics', { units: 0, chapters: 0, topics: 0 }]]),
    );
    expect(out[0]).toMatchObject({ id: 's1', isActive: true });
  });

  it('gives a subject with nothing under it zero counts', async () => {
    const { service } = build();
    const out = await service.findAllWithCounts();
    expect(out.find((s) => s.id === 's3')?.counts).toEqual({
      units: 0,
      chapters: 0,
      topics: 0,
    });
  });

  it('counts only active rows, scoped to the caller institute', async () => {
    const { prisma, service } = build();
    await service.findAllWithCounts();

    expect(prisma.unit.groupBy).toHaveBeenCalledWith({
      by: ['subjectId'],
      where: { instituteId: INSTITUTE, isActive: true },
      _count: { _all: true },
    });
    expect(prisma.chapter.groupBy).toHaveBeenCalledWith({
      by: ['subjectId'],
      where: { instituteId: INSTITUTE, isActive: true },
      _count: { _all: true },
    });
    expect(prisma.chapter.findMany).toHaveBeenCalledWith({
      where: { instituteId: INSTITUTE, isActive: true },
      select: {
        subjectId: true,
        _count: { select: { topics: { where: { isActive: true } } } },
      },
    });
  });

  it('refuses without an institute in context', async () => {
    const { service } = build();
    tenant.getInstituteId.mockReturnValueOnce(null as never);
    await expect(service.findAllWithCounts()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
