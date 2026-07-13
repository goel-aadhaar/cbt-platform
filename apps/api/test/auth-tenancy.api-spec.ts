import {
  addStudent,
  api,
  createApprovedQuestion,
  loginStaff,
  PASSWORD,
  setupTenant,
  TenantFixture,
} from './support/client';

/**
 * Functional + integration coverage (§2.17) for authentication, RBAC and — the
 * single most safety-critical property of the platform — multi-tenant isolation
 * (§2.1): no Institute may ever read another Institute's data.
 */
describe('Auth, RBAC and tenant isolation', () => {
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  beforeAll(async () => {
    tenantA = await setupTenant('a');
    tenantB = await setupTenant('b');
  });

  describe('authentication (§2.2)', () => {
    it('rejects a wrong password', async () => {
      const res = await api('/auth/login', {
        method: 'POST',
        body: { email: `admin-${tenantA.suffix}@test.local`, password: 'nope' },
      });
      expect(res.status).toBe(401);
    });

    it('rejects an unknown user', async () => {
      const res = await api('/auth/login', {
        method: 'POST',
        body: { email: 'ghost@test.local', password: PASSWORD },
      });
      expect(res.status).toBe(401);
    });

    it('rejects a request with no bearer token', async () => {
      const res = await api('/programs');
      expect(res.status).toBe(401);
    });

    it('rejects a garbage bearer token', async () => {
      const res = await api('/programs', { token: 'not-a-jwt' });
      expect(res.status).toBe(401);
    });

    it('students cannot log in through the staff endpoint', async () => {
      await addStudent(tenantA, 'Student One', 'AUTH1');
      const res = await api('/auth/login', {
        method: 'POST',
        body: {
          email: `auth1-${tenantA.suffix}@test.local`,
          password: PASSWORD,
        },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('single active session (§2.2)', () => {
    it('a new login invalidates the previous session', async () => {
      // Uses a throwaway tenant: logging in again necessarily kills the earlier
      // session, which would otherwise invalidate the shared fixture's token.
      const scratch = await setupTenant('ss');
      const email = `admin-${scratch.suffix}@test.local`;

      const first = await loginStaff(email);
      expect((await api('/auth/me', { token: first })).status).toBe(200);

      const second = await loginStaff(email);

      // The older token must now be rejected — prevents concurrent-device misuse.
      expect((await api('/auth/me', { token: first })).status).toBe(401);
      expect((await api('/auth/me', { token: second })).status).toBe(200);
    });
  });

  describe('RBAC (§2.2)', () => {
    it('a teacher cannot perform admin-only actions', async () => {
      const res = await api('/programs', {
        method: 'POST',
        token: tenantA.teacherToken,
        body: { name: 'Should Fail' },
      });
      expect(res.status).toBe(403);
    });

    it('a teacher cannot approve their own question', async () => {
      const created = await api<{ id: string }>('/questions', {
        method: 'POST',
        token: tenantA.teacherToken,
        body: {
          subject: 'Physics',
          chapter: 'Optics',
          difficulty: 'EASY',
          type: 'MCQ',
          examType: 'NEET',
          statement: 'Self approval?',
          options: [
            { key: 'A', text: '1' },
            { key: 'B', text: '2' },
          ],
          answerKey: 'A',
        },
      });
      await api(`/questions/${created.body.id}/submit`, {
        method: 'POST',
        token: tenantA.teacherToken,
      });

      const res = await api(`/questions/${created.body.id}/approve`, {
        method: 'POST',
        token: tenantA.teacherToken,
      });
      expect(res.status).toBe(403);
    });

    it('a student cannot reach admin endpoints', async () => {
      const studentToken = await addStudent(tenantA, 'Student Two', 'AUTH2');
      expect((await api('/students', { token: studentToken })).status).toBe(
        403,
      );
      expect((await api('/audit-logs', { token: studentToken })).status).toBe(
        403,
      );
    });
  });

  describe('tenant isolation (§2.1)', () => {
    it("an admin cannot see another institute's programs", async () => {
      const res = await api<unknown[]>('/programs', {
        token: tenantB.adminToken,
      });
      expect(res.status).toBe(200);
      // Tenant B sees only its own program, never tenant A's.
      expect(res.body).toHaveLength(1);
      expect(
        (res.body as { id: string }[]).some((p) => p.id === tenantA.programId),
      ).toBe(false);
    });

    it("an admin cannot fetch another institute's program by id", async () => {
      const res = await api(`/programs/${tenantA.programId}`, {
        token: tenantB.adminToken,
      });
      expect(res.status).toBe(404);
    });

    it("an admin cannot fetch another institute's question by id", async () => {
      const questionId = await createApprovedQuestion(tenantA);
      const res = await api(`/questions/${questionId}`, {
        token: tenantB.adminToken,
      });
      expect(res.status).toBe(404);
    });

    it("an admin cannot nest a class under another institute's program", async () => {
      const res = await api('/classes', {
        method: 'POST',
        token: tenantB.adminToken,
        body: { programId: tenantA.programId, name: 'Stolen' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('a student cannot log in against another institute slug', async () => {
      await addStudent(tenantA, 'Student Three', 'AUTH3');
      const res = await api('/auth/student/login', {
        method: 'POST',
        body: {
          instituteSlug: tenantB.slug,
          rollNumber: 'AUTH3',
          password: PASSWORD,
        },
      });
      expect(res.status).toBe(401);
    });
  });
});
