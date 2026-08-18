import {
  addStudent,
  api,
  countOtpCodes,
  createApprovedQuestion,
  getRollNumber,
  loginStaff,
  PASSWORD,
  setupTenant,
  TenantFixture,
  waitForNewOtpCode,
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

  /**
   * Email OTP as a mandatory second factor for every non-student door (§2.2).
   * The property that matters: a correct password on its own is NOT a login.
   */
  describe('login OTP (§2.2)', () => {
    it('a correct staff password returns a challenge, not a session', async () => {
      const scratch = await setupTenant('otp');
      const res = await api<{
        otpRequired: boolean;
        challengeId: string;
        sentTo: string;
        accessToken?: string;
      }>('/auth/login', {
        method: 'POST',
        body: {
          email: `admin-${scratch.suffix}@test.local`,
          password: PASSWORD,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.otpRequired).toBe(true);
      expect(res.body.challengeId).toBeTruthy();
      // The whole point: no credential is handed out at this step.
      expect(res.body.accessToken).toBeUndefined();
      // The address is masked so the screen can name the inbox without
      // exposing it to whoever typed the password.
      expect(res.body.sentTo).not.toContain(scratch.suffix);
      expect(res.body.sentTo).toContain('@');
    });

    it('rejects a wrong code, and the challenge cannot be reused once redeemed', async () => {
      const scratch = await setupTenant('otp2');
      const email = `admin-${scratch.suffix}@test.local`;

      const before = countOtpCodes();
      const challenge = await api<{ challengeId: string }>('/auth/login', {
        method: 'POST',
        body: { email, password: PASSWORD },
      });
      const code = await waitForNewOtpCode(before);

      const wrong = await api('/auth/login/verify', {
        method: 'POST',
        body: {
          challengeId: challenge.body.challengeId,
          code: code === '000000' ? '111111' : '000000',
        },
      });
      expect(wrong.status).toBe(401);

      const ok = await api<{ accessToken: string }>('/auth/login/verify', {
        method: 'POST',
        body: { challengeId: challenge.body.challengeId, code },
      });
      expect(ok.status).toBe(200);
      expect(ok.body.accessToken).toBeTruthy();

      // Single use: replaying the same code must not mint a second session.
      const replay = await api('/auth/login/verify', {
        method: 'POST',
        body: { challengeId: challenge.body.challengeId, code },
      });
      expect(replay.status).toBe(401);
    });

    /**
     * REGRESSION: the roles a code may act as are captured on the CHALLENGE at
     * issue time, so a code minted at the institute door cannot be spent for a
     * platform session — even for an account that genuinely holds SUPERADMIN.
     */
    it('a code minted at the staff door cannot reach a platform session', async () => {
      const scratch = await setupTenant('otp3');
      const email = `admin-${scratch.suffix}@test.local`;

      const before = countOtpCodes();
      const challenge = await api<{ challengeId: string }>('/auth/login', {
        method: 'POST',
        body: { email, password: PASSWORD },
      });
      const code = await waitForNewOtpCode(before);

      const session = await api<{
        user: { roles: string[] };
        selectableRoles: string[];
      }>('/auth/login/verify', {
        method: 'POST',
        body: { challengeId: challenge.body.challengeId, code },
      });
      expect(session.status).toBe(200);
      // The institute door only ever offers institute roles.
      expect(session.body.selectableRoles).not.toContain('SUPERADMIN');
    });

    it('students still sign in with one step — no code required', async () => {
      const token = await addStudent(tenantB, 'No Code Needed', 'NOOTP');
      // addStudent already asserts a 200 + token from /auth/student/login;
      // reaching an authenticated route proves it is a real session.
      expect((await api('/auth/me', { token })).status).toBe(200);
    });
  });

  /**
   * REGRESSION: brute-force lockout is keyed to the ACCOUNT, not the caller's
   * IP — an institute's staff share one office network, so an IP-keyed limit
   * would lock out a whole building over one person's typos.
   */
  describe('brute-force lockout (§2.2)', () => {
    it('locks the account after repeated wrong passwords, and a correct one still fails while locked', async () => {
      const scratch = await setupTenant('lock');
      const email = `admin-${scratch.suffix}@test.local`;

      // MAX_FAILED_LOGIN_ATTEMPTS is 8; sequential so the counter is exact.
      for (let i = 0; i < 8; i++) {
        const res = await api('/auth/login', {
          method: 'POST',
          body: { email, password: 'definitely-not-it' },
        });
        expect(res.status).toBe(401);
      }

      // The RIGHT password now fails too — otherwise the lock would be as easy
      // to step past as the guessing it exists to slow down.
      const correct = await api<{ message?: string }>('/auth/login', {
        method: 'POST',
        body: { email, password: PASSWORD },
      });
      expect(correct.status).toBe(401);
      expect(JSON.stringify(correct.body)).toMatch(/too many failed attempts/i);
    }, 120_000);

    it('one account’s lockout does not affect another account on the same IP', async () => {
      const scratch = await setupTenant('lock2');
      const victim = `admin-${scratch.suffix}@test.local`;
      const bystander = `teacher-${scratch.suffix}@test.local`;

      for (let i = 0; i < 8; i++) {
        await api('/auth/login', {
          method: 'POST',
          body: { email: victim, password: 'wrong-again' },
        });
      }

      // Same IP (this test process), different account: must be unaffected.
      const other = await api<{ otpRequired: boolean }>('/auth/login', {
        method: 'POST',
        body: { email: bystander, password: PASSWORD },
      });
      expect(other.status).toBe(200);
      expect(other.body.otpRequired).toBe(true);
    }, 120_000);
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

  describe('rate limiting', () => {
    it('buckets by candidate, not by IP — one candidate cannot exhaust another’s budget', async () => {
      // Both candidates reach the server from the same address, which is exactly
      // the situation in an exam hall: every seat in the lab shares the
      // institute's NAT address. If the limiter bucketed by IP, one busy
      // candidate (or simply 200 of them starting at once) would 429 the room.
      const noisy = await addStudent(tenantA, 'Noisy Candidate', 'RL1');
      const quiet = await addStudent(tenantA, 'Quiet Candidate', 'RL2');

      // Deliberately blow through the noisy candidate's own budget.
      const flood = await Promise.all(
        Array.from({ length: 140 }, () => api('/auth/me', { token: noisy })),
      );
      expect(flood.some((r) => r.status === 429)).toBe(true);

      // The quiet candidate shares the IP and must be completely unaffected.
      const unaffected = await api('/auth/me', { token: quiet });
      expect(unaffected.status).toBe(200);
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
      const token = await addStudent(tenantA, 'Student Three', 'AUTH3');
      const rollNumber = await getRollNumber(token);
      const res = await api('/auth/student/login', {
        method: 'POST',
        body: {
          instituteSlug: tenantB.slug,
          rollNumber,
          password: PASSWORD,
        },
      });
      expect(res.status).toBe(401);
    });
  });
});
