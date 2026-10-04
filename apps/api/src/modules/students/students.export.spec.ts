import { StudentsService } from './students.service';
import { StudentSort } from './dto/query-students.dto';

/**
 * Student List → Export Selected / Export All. The file must hold exactly the
 * requested students (one row each without results; one row per CBT result,
 * or a single blank-result row, with them), under the same institute scope
 * and filters as the roster.
 */
describe('StudentsService.exportRoster', () => {
  const MY_INSTITUTE = 'inst-mine';
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';

  const student = (
    id: string,
    roll: string,
    name: string,
    batch = 'Alpha',
  ) => ({
    id,
    rollNumber: roll,
    createdAt: new Date('2026-01-05T10:00:00Z'),
    user: {
      name,
      email: `${roll.toLowerCase()}@example.com`,
      status: 'ACTIVE',
    },
    batch: { name: batch },
  });

  const result = (
    studentId: string,
    title: string,
    over: Record<string, unknown> = {},
  ) => ({
    studentId,
    totalScore: 45,
    maxScore: 60,
    correctCount: 15,
    incorrectCount: 3,
    unattemptedCount: 2,
    overallRank: 4,
    batchRank: 2,
    percentile: 87.5,
    published: true,
    exam: { title, startAt: new Date('2026-03-01T04:30:00Z') },
    attempt: { submittedAt: new Date('2026-03-02T06:00:00Z') },
    ...over,
  });

  function build(
    students: ReturnType<typeof student>[],
    results: ReturnType<typeof result>[] = [],
  ) {
    const prisma = {
      student: { findMany: jest.fn(() => Promise.resolve(students)) },
      result: { findMany: jest.fn(() => Promise.resolve(results)) },
    };
    const tenant = { getInstituteId: jest.fn(() => MY_INSTITUTE) };
    const teacherScope = { myBatchIds: jest.fn(() => Promise.resolve(null)) };
    const service = new StudentsService(
      prisma as never,
      tenant as never,
      teacherScope as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  const BOM = '﻿';
  const lines = (csv: string) => {
    expect(csv.startsWith(BOM)).toBe(true);
    return csv.slice(1).split('\r\n');
  };
  const ROSTER_HEAD = 'registrationNumber,name,email,status,batch,joinedAt';
  const RESULT_HEAD =
    'exam,examDate,score,maxScore,percentage,rank,batchRank,correct,' +
    'incorrect,unattempted,percentile,published';

  it('without results: the plain roster, one row per student', async () => {
    const { service, prisma } = build([
      student(A, '26ABC0001', 'Aarav Sharma'),
      student(B, '26ABC0002', 'Priya Nair', 'Beta'),
    ]);
    const out = await service.exportRoster({ ids: [A, B] });

    expect(lines(out.csv)).toEqual([
      ROSTER_HEAD,
      '26ABC0001,Aarav Sharma,26abc0001@example.com,ACTIVE,Alpha,2026-01-05',
      '26ABC0002,Priya Nair,26abc0002@example.com,ACTIVE,Beta,2026-01-05',
    ]);
    expect(out).toMatchObject({ students: 2, resultRows: 0 });
    expect(out.filename).toMatch(/^codonmind-students-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it('ids path: scoped to the institute, the ids and the other filters', async () => {
    const { service, prisma } = build([]);
    await service.exportRoster({
      ids: [A, C],
      status: 'ACTIVE',
      classId: 'class-1',
      programId: 'prog-1',
      sort: StudentSort.NAME_ASC,
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          instituteId: MY_INSTITUTE,
          id: { in: [A, C] },
          user: { status: 'ACTIVE' },
          batch: { classId: 'class-1', class: { programId: 'prog-1' } },
        }) as unknown,
        orderBy: { user: { name: 'asc' } },
      }),
    );
  });

  it('filter path: no id condition, every match exported', async () => {
    const { service, prisma } = build([student(A, '26ABC0001', 'Aarav')]);
    await service.exportRoster({ batchId: 'batch-1', search: 'aar' });
    const { where } = (
      prisma.student.findMany.mock.calls[0] as unknown as [
        { where: Record<string, unknown>; take?: number },
      ]
    )[0];
    expect(where).not.toHaveProperty('id');
    expect(where).toMatchObject({
      instituteId: MY_INSTITUTE,
      batchId: { in: ['batch-1'] },
    });
    expect(where).toHaveProperty('OR');
  });

  it('with results: one row per result, blank result columns for a student without any', async () => {
    const { service, prisma } = build(
      [
        student(A, '26ABC0001', 'Aarav'),
        student(B, '26ABC0002', 'Priya'),
        student(C, '26ABC0003', 'Chen'),
      ],
      [
        result(A, 'Mock Test 1'),
        result(C, 'Mock Test 1', {
          published: false,
          overallRank: null,
          batchRank: null,
          percentile: null,
          attempt: { submittedAt: null },
        }),
        result(A, 'Mock Test 2', { totalScore: 30, maxScore: 40 }),
      ],
    );
    const out = await service.exportRoster({
      ids: [A, B, C],
      includeResults: true,
    });

    expect(lines(out.csv)).toEqual([
      `${ROSTER_HEAD},${RESULT_HEAD}`,
      '26ABC0001,Aarav,26abc0001@example.com,ACTIVE,Alpha,2026-01-05,' +
        'Mock Test 1,2026-03-02,45,60,75.00,4,2,15,3,2,87.50,Yes',
      '26ABC0001,Aarav,26abc0001@example.com,ACTIVE,Alpha,2026-01-05,' +
        'Mock Test 2,2026-03-02,30,40,75.00,4,2,15,3,2,87.50,Yes',
      '26ABC0002,Priya,26abc0002@example.com,ACTIVE,Alpha,2026-01-05' +
        ',,,,,,,,,,,,',
      // Held result: no rank yet, never submitted → exam start date.
      '26ABC0003,Chen,26abc0003@example.com,ACTIVE,Alpha,2026-01-05,' +
        'Mock Test 1,2026-03-01,45,60,75.00,,,15,3,2,,No',
    ]);
    expect(out).toMatchObject({ students: 3, resultRows: 3 });
    expect(out.filename).toMatch(/^codonmind-students-with-results-/);

    // Results are read for the same students the roster query selects.
    const studentWhere = (
      prisma.student.findMany.mock.calls[0] as unknown as [{ where: unknown }]
    )[0].where;
    expect(prisma.result.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instituteId: MY_INSTITUTE, student: studentWhere },
      }),
    );
  });

  it('a zero max score leaves the percentage blank', async () => {
    const { service } = build(
      [student(A, '26ABC0001', 'Aarav')],
      [result(A, 'Survey', { totalScore: 0, maxScore: 0 })],
    );
    const out = await service.exportRoster({ ids: [A], includeResults: true });
    expect(lines(out.csv)[1]).toContain(',Survey,2026-03-02,0,0,,4,');
  });

  it('no students: header only, and results are not queried', async () => {
    const { service, prisma } = build([]);
    const out = await service.exportRoster({ ids: [A], includeResults: true });
    expect(lines(out.csv)).toEqual([`${ROSTER_HEAD},${RESULT_HEAD}`]);
    expect(out).toMatchObject({ students: 0, resultRows: 0 });
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it('escapes commas, quotes and line breaks', async () => {
    const { service } = build(
      [student(A, '26ABC0001', 'Sharma, "Aarav"\nJr', 'Batch, A')],
      [result(A, 'Unit 1, "Algebra"')],
    );
    const out = await service.exportRoster({ ids: [A], includeResults: true });
    expect(out.csv).toContain(
      '26ABC0001,"Sharma, ""Aarav""\nJr",26abc0001@example.com,ACTIVE,' +
        '"Batch, A",2026-01-05,"Unit 1, ""Algebra""",',
    );
  });
});
