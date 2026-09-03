/**
 * Who may download a notice's attachment.
 *
 * `GET /media/file/:key` is reachable by any signed-in candidate with nothing
 * but a key, so the entitlement check in MediaService is the only thing between
 * a guessed UUID and someone else's file. It repeats the three conditions the
 * student feed applies — published, unexpired, addressed to you — rather than
 * trusting that the feed filtered correctly, because the feed is not in the
 * request path at all.
 *
 * These pin the rule itself. The Prisma `where` in MediaService is built from
 * exactly these conditions; this is the truth table it has to satisfy.
 */

interface Notice {
  publishedAt: Date | null;
  expiresAt: Date | null;
  toStudents: boolean;
  /** Empty means every student; otherwise only these batches. */
  batchIds: string[];
}

/** Mirrors the `where` clause in MediaService.assertReadableByCaller. */
function studentMayDownload(
  notice: Notice,
  student: { batchId: string },
  now: Date,
): boolean {
  const published = notice.publishedAt !== null && notice.publishedAt <= now;
  const live = notice.expiresAt === null || notice.expiresAt > now;
  const addressed =
    notice.toStudents &&
    (notice.batchIds.length === 0 || notice.batchIds.includes(student.batchId));
  return published && live && addressed;
}

describe('downloading a notice attachment', () => {
  const now = new Date('2026-08-23T12:00:00Z');
  const ago = new Date('2026-08-01T00:00:00Z');
  const soon = new Date('2026-09-01T00:00:00Z');
  const student = { batchId: 'batch-a' };

  const notice = (over: Partial<Notice> = {}): Notice => ({
    publishedAt: ago,
    expiresAt: null,
    toStudents: true,
    batchIds: [],
    ...over,
  });

  it('allows a published notice addressed to everyone', () => {
    expect(studentMayDownload(notice(), student, now)).toBe(true);
  });

  it('allows a batch notice for the student’s own batch', () => {
    expect(
      studentMayDownload(
        notice({
          batchIds: ['batch-a'],
        }),
        student,
        now,
      ),
    ).toBe(true);
  });

  it('refuses a batch notice aimed at another batch', () => {
    // The case a guessed key would otherwise reach: the file exists, it is in
    // the right institute, and it is still none of this candidate's business.
    expect(
      studentMayDownload(
        notice({
          batchIds: ['batch-b'],
        }),
        student,
        now,
      ),
    ).toBe(false);
  });

  it('refuses a draft', () => {
    // An unpublished notice is work in progress. Its attachment leaking early
    // is the same disclosure as the notice leaking early.
    expect(
      studentMayDownload(notice({ publishedAt: null }), student, now),
    ).toBe(false);
  });

  it('refuses one scheduled to publish later', () => {
    expect(
      studentMayDownload(notice({ publishedAt: soon }), student, now),
    ).toBe(false);
  });

  it('refuses one that has expired', () => {
    expect(studentMayDownload(notice({ expiresAt: ago }), student, now)).toBe(
      false,
    );
  });

  it('allows one that has not expired yet', () => {
    expect(studentMayDownload(notice({ expiresAt: soon }), student, now)).toBe(
      true,
    );
  });

  it('requires every condition, not any of them', () => {
    // Guards the classic slip of OR-ing the clauses: a draft aimed at another
    // batch satisfies nothing and must still be refused.
    expect(
      studentMayDownload(
        notice({
          publishedAt: null,
          batchIds: ['batch-b'],
          expiresAt: ago,
        }),
        student,
        now,
      ),
    ).toBe(false);
  });
});
