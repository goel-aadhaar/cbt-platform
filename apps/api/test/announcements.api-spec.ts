import {
  addStudent,
  api,
  countInviteTokens,
  expectStatus,
  loginStaff,
  PASSWORD,
  setupTenant,
  waitForInviteTokens,
  type TenantFixture,
} from './support/client';

/**
 * Who a notice reaches (§2.9).
 *
 * A notice used to be `audience: ALL_STUDENTS | BATCH` plus one nullable batch
 * id. It now carries two audience flags and two narrowing lists, which makes
 * "everyone", "these batches", "the teachers", and "these teachers" all
 * expressible — and makes the wrong combination expressible too.
 *
 * Four viewer kinds see four different things from the same rows, so the
 * matrix is asserted against a real database rather than only against the
 * filter builder: a Prisma relation filter that reads correctly can still
 * return the wrong set once the join exists.
 */

interface NoticeRow {
  id: string;
  title: string;
  toStudents: boolean;
  toTeachers: boolean;
}

describe('Announcement audiences', () => {
  let tenant: TenantFixture;
  let betaBatchId: string;

  let alphaStudent: string;
  let betaStudent: string;

  /** The teacher setupTenant creates, plus a second one to exclude. */
  let teacherAToken: string;
  let teacherAId: string;
  let teacherBToken: string;

  async function publish(
    label: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await api<NoticeRow>('/announcements', {
      method: 'POST',
      token: tenant.adminToken,
      body: { title: label, body: `Body of ${label}`, ...body },
    });
    expectStatus(res, 201);
    expectStatus(
      await api(`/announcements/${res.body.id}/publish`, {
        method: 'POST',
        token: tenant.adminToken,
      }),
      200,
    );
    return res.body.id;
  }

  /** Titles of everything this viewer can see in their own feed. */
  async function feed(token: string): Promise<string[]> {
    const res = await api<NoticeRow[] | { items: NoticeRow[] }>(
      '/me/announcements',
      { token },
    );
    expectStatus(res, 200);
    const rows = Array.isArray(res.body) ? res.body : res.body.items;
    return rows.map((r) => r.title);
  }

  beforeAll(async () => {
    tenant = await setupTenant('ann');
    teacherAToken = tenant.teacherToken;

    const me = await api<{ id: string }>('/auth/me', { token: teacherAToken });
    expectStatus(me, 200);
    teacherAId = me.body.id;

    const beta = await api<{ id: string }>('/batches', {
      method: 'POST',
      token: tenant.adminToken,
      body: { classId: tenant.classId, name: 'Beta' },
    });
    expectStatus(beta, 201);
    betaBatchId = beta.body.id;

    [alphaStudent, betaStudent] = await Promise.all([
      addStudent(tenant, 'Alpha Candidate', 'ANNA', tenant.batchId),
      addStudent(tenant, 'Beta Candidate', 'ANNB', betaBatchId),
    ]);

    // A second teacher, so "addressed to teacher A" has someone to exclude.
    teacherBToken = await addTeacher(tenant, 'Teacher B', 'teacherb');

    await publish('Everyone', { toStudents: true, toTeachers: true });
    await publish('All students', { toStudents: true });
    await publish('Alpha only', {
      toStudents: true,
      batchIds: [tenant.batchId],
    });
    await publish('All teachers', { toStudents: false, toTeachers: true });
    await publish('Teacher A only', {
      toStudents: false,
      toTeachers: true,
      teacherIds: [teacherAId],
    });
    // A tenant, two students, two teachers and five published notices is a
    // few dozen round trips — more than the default hook budget allows.
  }, 300_000);

  it('sends an unnarrowed student notice to every batch', async () => {
    expect(await feed(alphaStudent)).toContain('All students');
    expect(await feed(betaStudent)).toContain('All students');
  });

  it('sends a batch-narrowed notice only to that batch', async () => {
    expect(await feed(alphaStudent)).toContain('Alpha only');
    expect(await feed(betaStudent)).not.toContain('Alpha only');
  });

  it('never shows a student a staff notice', async () => {
    for (const token of [alphaStudent, betaStudent]) {
      const titles = await feed(token);
      expect(titles).not.toContain('All teachers');
      expect(titles).not.toContain('Teacher A only');
    }
  });

  it('sends an unnarrowed staff notice to every teacher', async () => {
    expect(await feed(teacherAToken)).toContain('All teachers');
    expect(await feed(teacherBToken)).toContain('All teachers');
  });

  it('sends a teacher-narrowed notice only to that teacher', async () => {
    expect(await feed(teacherAToken)).toContain('Teacher A only');
    expect(await feed(teacherBToken)).not.toContain('Teacher A only');
  });

  it('never shows a teacher a students-only notice', async () => {
    for (const token of [teacherAToken, teacherBToken]) {
      const titles = await feed(token);
      expect(titles).not.toContain('All students');
      expect(titles).not.toContain('Alpha only');
    }
  });

  it('reaches both audiences when both are addressed', async () => {
    for (const token of [
      alphaStudent,
      betaStudent,
      teacherAToken,
      teacherBToken,
    ]) {
      expect(await feed(token)).toContain('Everyone');
    }
  });

  it('refuses a notice addressed to nobody', async () => {
    const res = await api('/announcements', {
      method: 'POST',
      token: tenant.adminToken,
      body: {
        title: 'Addressed to nobody',
        body: 'Nobody will read this.',
        toStudents: false,
        toTeachers: false,
      },
    });
    expectStatus(res, 400);
  });

  it('refuses to let a teacher address other staff', async () => {
    const res = await api('/announcements', {
      method: 'POST',
      token: teacherAToken,
      body: {
        title: 'Staff meeting',
        body: 'From a teacher, to teachers.',
        toStudents: false,
        toTeachers: true,
      },
    });
    // Forbidden, not silently downgraded to a student notice — a teacher who
    // thought they had told the staff something must be told they had not.
    expectStatus(res, 403);
  });

  it('refuses a batch from another institute', async () => {
    const other = await setupTenant('ann2');
    const res = await api('/announcements', {
      method: 'POST',
      token: tenant.adminToken,
      body: {
        title: 'Cross-tenant notice',
        body: 'Should never be created.',
        toStudents: true,
        batchIds: [other.batchId],
      },
    });
    expect([400, 404]).toContain(res.status);
  });

  describe('the unread badge', () => {
    it('agrees with the page it labels, for a teacher', async () => {
      const count = await api<{ count: number }>(
        '/me/announcements/unread-count',
        { token: teacherBToken },
      );
      expectStatus(count, 200);

      const titles = await feed(teacherBToken);
      // Teacher B has seen nothing yet, so every visible notice is unread.
      // A badge that disagrees with its own page is the bug this guards.
      expect(count.body.count).toBe(titles.length);
    });

    it('clears once the page has been opened', async () => {
      expectStatus(
        await api('/me/announcements/seen', {
          method: 'POST',
          token: teacherBToken,
        }),
        200,
      );
      const after = await api<{ count: number }>(
        '/me/announcements/unread-count',
        { token: teacherBToken },
      );
      expectStatus(after, 200);
      expect(after.body.count).toBe(0);
    });

    it('does not count a notice this viewer cannot see', async () => {
      // Addressed to teacher A only, after teacher B marked everything seen.
      await publish('Second private note for A', {
        toStudents: false,
        toTeachers: true,
        teacherIds: [teacherAId],
      });

      const b = await api<{ count: number }>('/me/announcements/unread-count', {
        token: teacherBToken,
      });
      expectStatus(b, 200);
      expect(b.body.count).toBe(0);

      const a = await api<{ count: number }>('/me/announcements/unread-count', {
        token: teacherAToken,
      });
      expectStatus(a, 200);
      expect(a.body.count).toBeGreaterThan(0);
    });
  });
});

/**
 * Invites a second teacher, accepts, and logs them in.
 *
 * setupTenant() creates exactly one teacher and its invite/accept sequence is
 * private to the support module, so it is repeated here rather than widening
 * that API for a single caller.
 */
async function addTeacher(
  tenant: TenantFixture,
  name: string,
  emailTag: string,
): Promise<string> {
  const email = `${emailTag}-${tenant.suffix}@test.local`;
  const before = countInviteTokens();
  const invite = await api('/invitations/teacher', {
    method: 'POST',
    token: tenant.adminToken,
    body: { name, email },
  });
  expectStatus(invite, 201);

  const [token] = await waitForInviteTokens(before, 1);
  const accept = await api('/invitations/accept', {
    method: 'POST',
    body: { token, password: PASSWORD },
  });
  expectStatus(accept, 201);

  return loginStaff(email);
}
