/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma */
import { NotFoundException } from '@nestjs/common';

import { Role } from '../auth/auth.types';
import { buildImportWarnings } from './import-warnings';
import { ImportsService } from './imports.service';

describe('buildImportWarnings', () => {
  it('is silent for a file numbered 1..n in order', () => {
    expect(
      buildImportWarnings([1, 2, 3].map((n) => ({ seq: n, label: `${n}` }))),
    ).toEqual([]);
  });

  it('flags a number that disagrees with its position', () => {
    expect(
      buildImportWarnings([
        { seq: 1, label: '1' },
        { seq: 2, label: '2' },
        { seq: 3, label: 'Q10' },
      ]),
    ).toEqual(['File numbering jumps: Q10 is item 3 in the file.']);
  });

  it('flags duplicate numbers and skipped items', () => {
    const warnings = buildImportWarnings([
      { seq: 1, label: '1' },
      { seq: 3, label: '1' },
    ]);
    expect(warnings.join('\n')).toMatch(/Item 2 had no question text/);
    expect(warnings.join('\n')).toMatch(/Number 1 is used more than once/);
  });

  it('summarises a long run of mismatches', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      seq: i + 1,
      label: `${i + 6}`,
    }));
    const warnings = buildImportWarnings(items);
    expect(warnings).toHaveLength(11);
    expect(warnings[10]).toMatch(/20 more questions/);
  });

  it('ignores items without a label', () => {
    expect(buildImportWarnings([{ seq: 1 }, { seq: 2, label: null }])).toEqual(
      [],
    );
  });
});

describe('ImportsService.get', () => {
  function build(role: Role) {
    const tenant = {
      get: () => ({ userId: 'u1', role, instituteId: 'inst-1' }),
    };
    const run = {
      id: 'run-1',
      failures: [{ sourceSeq: 2, sourceLabel: '2', reason: 'Missing answer' }],
    };
    const prisma = {
      importRun: {
        findFirst: jest.fn().mockResolvedValue(run) as jest.Mock<
          Promise<unknown>,
          [{ where: Record<string, unknown> }]
        >,
      },
      question: {
        findMany: jest.fn(async () => [
          { sourceSeq: 1, sourceLabel: '1' },
          { sourceSeq: 3, sourceLabel: 'Q9' },
        ]),
      },
    };
    return {
      service: new ImportsService(prisma as never, tenant as never),
      prisma,
    };
  }

  it('returns the run with warnings derived from questions and failures', async () => {
    const { service } = build(Role.ADMIN);
    const res = await service.get('run-1');
    expect(res.warnings).toEqual([
      'File numbering jumps: Q9 is item 3 in the file.',
    ]);
  });

  it('scopes a teacher to their own runs', async () => {
    const { service, prisma } = build(Role.TEACHER);
    await service.get('run-1');
    expect(prisma.importRun.findFirst.mock.calls[0][0]).toMatchObject({
      where: { id: 'run-1', instituteId: 'inst-1', createdById: 'u1' },
    });
  });

  it('does not scope an admin by creator', async () => {
    const { service, prisma } = build(Role.ADMIN);
    await service.get('run-1');
    const { where } = prisma.importRun.findFirst.mock.calls[0][0];
    expect(where.createdById).toBeUndefined();
  });

  it('404s when the run is not visible', async () => {
    const { service, prisma } = build(Role.ADMIN);
    prisma.importRun.findFirst.mockResolvedValueOnce(null);
    await expect(service.get('nope')).rejects.toThrow(NotFoundException);
  });
});
