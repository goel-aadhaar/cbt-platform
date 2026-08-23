/**
 * Who sees which study material.
 *
 * Three callers, three different rules, and the batch is the whole permission
 * in each case. Worth pinning here rather than only against the database: the
 * institute this was developed against has a single batch, so the case that
 * actually matters — a student not seeing another batch's material — cannot be
 * exercised there at all.
 */

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface Resource {
  id: string;
  batchId: string;
}

/**
 * Mirrors the batch filter ResourcesService.list() builds.
 *
 * `null` from the teacher scope means "not acting as a teacher" — unrestricted.
 * `[]` means a teacher assigned to no batches, which must mean *nothing*, not
 * everything; that distinction is the one this is really guarding.
 */
function visibleTo(
  all: Resource[],
  caller: {
    role: Role;
    studentBatchId?: string;
    teacherBatchIds: string[] | null;
  },
): Resource[] {
  if (caller.role === 'STUDENT') {
    return all.filter((r) => r.batchId === caller.studentBatchId);
  }
  if (caller.teacherBatchIds === null) return all;
  return all.filter((r) => caller.teacherBatchIds!.includes(r.batchId));
}

describe('resource visibility', () => {
  const all: Resource[] = [
    { id: 'r-a', batchId: 'batch-a' },
    { id: 'r-b', batchId: 'batch-b' },
    { id: 'r-c', batchId: 'batch-c' },
  ];

  it("shows a student only their own batch's material", () => {
    const seen = visibleTo(all, {
      role: 'STUDENT',
      studentBatchId: 'batch-a',
      teacherBatchIds: null,
    });
    expect(seen.map((r) => r.id)).toEqual(['r-a']);
  });

  it('shows a teacher every batch they teach, and no others', () => {
    const seen = visibleTo(all, {
      role: 'TEACHER',
      teacherBatchIds: ['batch-a', 'batch-c'],
    });
    expect(seen.map((r) => r.id)).toEqual(['r-a', 'r-c']);
  });

  it('shows a teacher with no batches nothing at all', () => {
    // The trap: `[]` is falsy-adjacent and easy to treat as "no filter", which
    // would hand an unassigned teacher the entire institute's material.
    const seen = visibleTo(all, { role: 'TEACHER', teacherBatchIds: [] });
    expect(seen).toEqual([]);
  });

  it('shows an admin the whole institute', () => {
    // An admin is not scoped by batch — `myBatchIds()` returns null for them.
    const seen = visibleTo(all, { role: 'ADMIN', teacherBatchIds: null });
    expect(seen.map((r) => r.id)).toEqual(['r-a', 'r-b', 'r-c']);
  });

  it('never lets a student reach another batch by asking for it', () => {
    // A student's batch comes from their own Student row, never from the
    // request, so there is no parameter to tamper with — this asserts the
    // filter itself cannot be widened.
    const seen = visibleTo(all, {
      role: 'STUDENT',
      studentBatchId: 'batch-a',
      teacherBatchIds: ['batch-a', 'batch-b', 'batch-c'],
    });
    expect(seen.map((r) => r.id)).toEqual(['r-a']);
  });
});

/** Mirrors ResourcesService.assertCanPublishTo. */
function mayPublishTo(
  batchId: string,
  teacherBatchIds: string[] | null,
): boolean {
  return teacherBatchIds === null || teacherBatchIds.includes(batchId);
}

describe('publishing a resource', () => {
  it('lets a teacher share with a batch they teach', () => {
    expect(mayPublishTo('batch-a', ['batch-a', 'batch-b'])).toBe(true);
  });

  it('refuses a batch they do not teach', () => {
    // Without this the batch selector is a dropdown, not a permission: a
    // teacher could hand material to any batch by sending a different id.
    expect(mayPublishTo('batch-z', ['batch-a', 'batch-b'])).toBe(false);
  });

  it('refuses everything when a teacher has no batches', () => {
    expect(mayPublishTo('batch-a', [])).toBe(false);
  });

  it('lets an admin share with any batch in their institute', () => {
    expect(mayPublishTo('batch-z', null)).toBe(true);
  });
});
