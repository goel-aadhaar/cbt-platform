import { StudentsService } from './students.service';
import { StudentSort } from './dto/query-students.dto';

/**
 * `GET /students?ids=` — the selective export on the Student List fetches
 * exactly the checked students through this filter. It must narrow the
 * roster to those ids WITHOUT loosening anything else: the institute scope,
 * the teacher's batch scope and every other filter still apply, and the
 * total/counts are computed over the same narrowed set.
 */
describe('StudentsService.findAll — ids filter', () => {
  const MY_INSTITUTE = 'inst-mine';
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  function build(scope: string[] | null = null) {
    const student = {
      findMany: jest.fn((args: unknown) => ({ op: 'findMany', args })),
      count: jest.fn((args: unknown) => ({ op: 'count', args })),
    };
    const raw = {
      student,
      $executeRaw: jest.fn(() => ({ op: 'set_config' })),
      $transaction: jest.fn((ops: unknown[]) =>
        Promise.resolve([
          undefined,
          [
            {
              id: A,
              rollNumber: '26ABC0001',
              createdAt: new Date('2026-01-01T00:00:00Z'),
              user: {
                name: 'Aarav',
                email: 'a@example.com',
                status: 'ACTIVE',
                invitedBy: null,
              },
              batch: { id: 'b1', name: 'Alpha' },
            },
          ],
          ...ops.slice(2).map(() => 1),
        ]),
      ),
    };
    const tenant = {
      getInstituteId: jest.fn(() => MY_INSTITUTE),
      get: jest.fn(() => ({ instituteId: MY_INSTITUTE, isSuperadmin: false })),
    };
    const teacherScope = { myBatchIds: jest.fn(() => Promise.resolve(scope)) };

    const service = new StudentsService(
      { raw } as never,
      tenant as never,
      teacherScope as never,
      {} as never,
      {} as never,
    );
    return { service, student };
  }

  const whereOf = (call: unknown[]) =>
    (call[0] as { where: Record<string, unknown> }).where;

  it('adds no id condition when ids is absent', async () => {
    const { service, student } = build();
    await service.findAll({});
    const where = whereOf(student.findMany.mock.calls[0]);
    expect(where).not.toHaveProperty('id');
    expect(where.instituteId).toBe(MY_INSTITUTE);
  });

  it('narrows the page, the total and every count to the requested ids', async () => {
    const { service, student } = build();
    await service.findAll({ ids: [A, B] });

    expect(whereOf(student.findMany.mock.calls[0])).toMatchObject({
      instituteId: MY_INSTITUTE,
      id: { in: [A, B] },
    });
    // total + all/active/disabled/pending
    expect(student.count).toHaveBeenCalledTimes(5);
    for (const call of student.count.mock.calls) {
      expect(whereOf(call)).toMatchObject({
        instituteId: MY_INSTITUTE,
        id: { in: [A, B] },
      });
    }
  });

  it('combines ids with the other filters and the teacher batch scope', async () => {
    const { service, student } = build(['batch-in-scope']);
    await service.findAll({
      ids: [A],
      status: 'ACTIVE',
      search: 'aar',
      sort: StudentSort.NAME_DESC,
    });

    const args = student.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(args.where).toMatchObject({
      instituteId: MY_INSTITUTE,
      id: { in: [A] },
      batchId: { in: ['batch-in-scope'] },
      user: { status: 'ACTIVE' },
    });
    expect(args.where).toHaveProperty('OR');
    expect(args.orderBy).toEqual({ user: { name: 'desc' } });
  });

  it('applies class and program together instead of one replacing the other', async () => {
    const { service, student } = build();
    await service.findAll({ classId: 'class-1', programId: 'prog-1' });
    expect(whereOf(student.findMany.mock.calls[0]).batch).toEqual({
      classId: 'class-1',
      class: { programId: 'prog-1' },
    });
  });

  it('returns the flattened rows as before', async () => {
    const { service } = build();
    const out = await service.findAll({ ids: [A] });
    expect(out.items).toEqual([
      {
        id: A,
        rollNumber: '26ABC0001',
        name: 'Aarav',
        email: 'a@example.com',
        status: 'ACTIVE',
        batch: { id: 'b1', name: 'Alpha' },
        createdAt: new Date('2026-01-01T00:00:00Z'),
        addedBy: null,
      },
    ]);
    expect(out.total).toBe(1);
  });
});
