/**
 * Who sees which study material.
 *
 * Three callers, three different rules, and the batch is the whole permission
 * in each case. Worth pinning here rather than only against the database: the
 * institute this was developed against has a single batch, so the case that
 * actually matters — a student not seeing another batch's material — cannot be
 * exercised there at all.
 *
 * A resource now reaches a SET of batches, so "shared with me" became an
 * intersection rather than an equality. That is the change these guard.
 */

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface Resource {
  id: string;
  /** Every batch this resource was shared with. */
  batchIds: string[];
}

/**
 * Mirrors the batch filter ResourcesService.visibleWhere() builds
 * (`batches: { some: { batchId: ... } }`).
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
    return all.filter((r) => r.batchIds.includes(caller.studentBatchId!));
  }
  if (caller.teacherBatchIds === null) return all;
  const mine = caller.teacherBatchIds;
  return all.filter((r) => r.batchIds.some((b) => mine.includes(b)));
}

describe('resource visibility', () => {
  const all: Resource[] = [
    { id: 'r-a', batchIds: ['batch-a'] },
    { id: 'r-b', batchIds: ['batch-b'] },
    { id: 'r-c', batchIds: ['batch-c'] },
    // Shared with two batches at once — the case the old single-column model
    // could not express, and the reason a teacher had to upload twice.
    { id: 'r-ab', batchIds: ['batch-a', 'batch-b'] },
  ];

  it('shows a student only material shared with their own batch', () => {
    const seen = visibleTo(all, {
      role: 'STUDENT',
      studentBatchId: 'batch-a',
      teacherBatchIds: null,
    });
    expect(seen.map((r) => r.id)).toEqual(['r-a', 'r-ab']);
  });

  it('shows material shared with several batches to a student in any of them', () => {
    const inB = visibleTo(all, {
      role: 'STUDENT',
      studentBatchId: 'batch-b',
      teacherBatchIds: null,
    });
    expect(inB.map((r) => r.id)).toEqual(['r-b', 'r-ab']);
  });

  it("still hides another batch's material from a student", () => {
    const seen = visibleTo(all, {
      role: 'STUDENT',
      studentBatchId: 'batch-c',
      teacherBatchIds: null,
    });
    expect(seen.map((r) => r.id)).toEqual(['r-c']);
  });

  it('shows a teacher every batch they teach, and no others', () => {
    const seen = visibleTo(all, {
      role: 'TEACHER',
      teacherBatchIds: ['batch-a', 'batch-c'],
    });
    expect(seen.map((r) => r.id)).toEqual(['r-a', 'r-c', 'r-ab']);
  });

  it('shows a teacher a resource that only partly overlaps their batches', () => {
    // r-ab reaches batch-a and batch-b; a teacher of batch-b alone must see it,
    // because they are responsible for one of the audiences it went to.
    const seen = visibleTo(all, {
      role: 'TEACHER',
      teacherBatchIds: ['batch-b'],
    });
    expect(seen.map((r) => r.id)).toEqual(['r-b', 'r-ab']);
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
    expect(seen.map((r) => r.id)).toEqual(['r-a', 'r-b', 'r-c', 'r-ab']);
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
    expect(seen.map((r) => r.id)).toEqual(['r-a', 'r-ab']);
  });
});

/** Mirrors ResourcesService.assertCanPublishTo, which now takes a list. */
function mayPublishTo(
  batchIds: string[],
  teacherBatchIds: string[] | null,
): boolean {
  if (teacherBatchIds === null) return true;
  return batchIds.every((b) => teacherBatchIds.includes(b));
}

describe('publishing a resource', () => {
  it('lets a teacher share with batches they teach', () => {
    expect(mayPublishTo(['batch-a', 'batch-b'], ['batch-a', 'batch-b'])).toBe(
      true,
    );
  });

  it('refuses a batch they do not teach', () => {
    // Without this the batch selector is a dropdown, not a permission: a
    // teacher could hand material to any batch by sending a different id.
    expect(mayPublishTo(['batch-z'], ['batch-a', 'batch-b'])).toBe(false);
  });

  it('refuses the whole request when only ONE batch is unauthorised', () => {
    // The case multi-batch introduced: all-or-nothing, so a teacher cannot
    // smuggle a foreign batch alongside legitimate ones and have it silently
    // accepted with the rest.
    expect(mayPublishTo(['batch-a', 'batch-z'], ['batch-a'])).toBe(false);
  });

  it('refuses everything when a teacher has no batches', () => {
    expect(mayPublishTo(['batch-a'], [])).toBe(false);
  });

  it('lets an admin share with any batch in their institute', () => {
    expect(mayPublishTo(['batch-z'], null)).toBe(true);
  });
});
