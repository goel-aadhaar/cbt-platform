import {
  addStudent,
  api,
  createApprovedQuestion,
  createPublishedExam,
  PASSWORD,
  setupTenant,
  TenantFixture,
} from './support/client';

/**
 * Reliability testing (§2.17): "Auto-save, reconnection recovery, session
 * recovery and the server timer."
 *
 * These are the properties an exam candidate's marks depend on, so each is
 * driven against the real running server rather than asserted in a unit test.
 */
describe('Reliability', () => {
  let tenant: TenantFixture;
  let questionA: string;
  let questionB: string;

  beforeAll(async () => {
    tenant = await setupTenant('rel');
    questionA = await createApprovedQuestion(tenant, {
      statement: 'Reliability question one?',
    });
    questionB = await createApprovedQuestion(tenant, {
      statement: 'Reliability question two?',
    });
  });

  describe('auto-save (§2.2)', () => {
    it('starting an attempt returns a blank palette entry for every question', async () => {
      // Guards the hot-path optimisation: start() builds the attempt, its blank
      // responses and the returned state in ONE nested write, so the response
      // rows must come back from that same call.
      const student = await addStudent(tenant, 'Blank Palette', 'REL8');
      const { examId } = await createPublishedExam(tenant, {
        title: 'Palette Exam',
        questionIds: [questionA, questionB],
      });

      const start = await api<{
        responses: { questionId: string; status: string }[];
      }>('/attempts', { method: 'POST', token: student, body: { examId } });

      expect(start.status).toBe(201);
      expect(start.body.responses).toHaveLength(2);
      expect(
        start.body.responses.every((r) => r.status === 'NOT_VISITED'),
      ).toBe(true);
    });

    it('a saved answer is durable and reflected in the palette state', async () => {
      const student = await addStudent(tenant, 'Auto Save', 'REL1');
      const { examId } = await createPublishedExam(tenant, {
        title: 'Auto-save Exam',
        questionIds: [questionA, questionB],
      });

      const start = await api<{ id: string }>('/attempts', {
        method: 'POST',
        token: student,
        body: { examId },
      });
      const attemptId = start.body.id;

      const saved = await api<{ status: string }>(
        `/attempts/${attemptId}/responses/${questionA}`,
        { method: 'PUT', token: student, body: { answer: 'A' } },
      );
      expect(saved.status).toBe(200);

      const state = await api<{
        responses: { questionId: string; answer: unknown; status: string }[];
      }>(`/attempts/${attemptId}`, { token: student });

      const response = state.body.responses.find(
        (r) => r.questionId === questionA,
      );
      expect(response?.answer).toBe('A');
      expect(response?.status).toBe('ANSWERED');
    });

    it('clearing a response returns it to NOT_ANSWERED', async () => {
      const student = await addStudent(tenant, 'Clear Response', 'REL2');
      const { examId } = await createPublishedExam(tenant, {
        title: 'Clear Exam',
        questionIds: [questionA],
      });
      const start = await api<{ id: string }>('/attempts', {
        method: 'POST',
        token: student,
        body: { examId },
      });
      const attemptId = start.body.id;

      await api(`/attempts/${attemptId}/responses/${questionA}`, {
        method: 'PUT',
        token: student,
        body: { answer: 'A' },
      });
      await api(`/attempts/${attemptId}/responses/${questionA}`, {
        method: 'PUT',
        token: student,
        body: { answer: null },
      });

      const state = await api<{
        responses: { questionId: string; answer: unknown; status: string }[];
      }>(`/attempts/${attemptId}`, { token: student });
      const response = state.body.responses.find(
        (r) => r.questionId === questionA,
      );
      expect(response?.answer).toBeNull();
      expect(response?.status).toBe('NOT_ANSWERED');
    });
  });

  describe('reconnection recovery (§2.2)', () => {
    it('re-fetching the attempt restores answers and the remaining time', async () => {
      const student = await addStudent(tenant, 'Reconnect', 'REL3');
      const { examId } = await createPublishedExam(tenant, {
        title: 'Reconnect Exam',
        questionIds: [questionA, questionB],
      });

      const start = await api<{ id: string; remainingSeconds: number }>(
        '/attempts',
        { method: 'POST', token: student, body: { examId } },
      );
      const attemptId = start.body.id;
      const remainingAtStart = start.body.remainingSeconds;

      await api(`/attempts/${attemptId}/responses/${questionA}`, {
        method: 'PUT',
        token: student,
        body: { answer: 'A' },
      });

      // Simulate the browser dying and reconnecting: nothing but a fresh GET.
      const resumed = await api<{
        id: string;
        status: string;
        remainingSeconds: number;
        responses: { questionId: string; answer: unknown }[];
      }>(`/attempts/${attemptId}`, { token: student });

      expect(resumed.body.status).toBe('IN_PROGRESS');
      expect(
        resumed.body.responses.find((r) => r.questionId === questionA)?.answer,
      ).toBe('A');
      // The clock is server-owned: it kept running while "offline" and never reset.
      expect(resumed.body.remainingSeconds).toBeLessThanOrEqual(
        remainingAtStart,
      );
      expect(resumed.body.remainingSeconds).toBeGreaterThan(0);
    });

    it('re-POSTing start resumes the same attempt instead of creating a new one', async () => {
      const student = await addStudent(tenant, 'Resume', 'REL4');
      const { examId } = await createPublishedExam(tenant, {
        title: 'Resume Exam',
        questionIds: [questionA],
      });

      const first = await api<{ id: string }>('/attempts', {
        method: 'POST',
        token: student,
        body: { examId },
      });
      const second = await api<{ id: string }>('/attempts', {
        method: 'POST',
        token: student,
        body: { examId },
      });

      expect(second.body.id).toBe(first.body.id);
    });
  });

  describe('session recovery (§2.2)', () => {
    it('a re-login mid-exam issues a working token and preserves saved answers', async () => {
      const studentFirst = await addStudent(tenant, 'Session', 'REL5');
      const { examId } = await createPublishedExam(tenant, {
        title: 'Session Exam',
        questionIds: [questionA],
      });

      const start = await api<{ id: string }>('/attempts', {
        method: 'POST',
        token: studentFirst,
        body: { examId },
      });
      const attemptId = start.body.id;
      await api(`/attempts/${attemptId}/responses/${questionA}`, {
        method: 'PUT',
        token: studentFirst,
        body: { answer: 'A' },
      });

      // Candidate logs in again (e.g. new device). Old session dies, but the
      // responses already saved must survive — contract §2.2.
      const relogin = await api<{ accessToken: string }>(
        '/auth/student/login',
        {
          method: 'POST',
          body: {
            instituteSlug: tenant.slug,
            rollNumber: 'REL5',
            password: PASSWORD,
          },
        },
      );
      const studentSecond = relogin.body.accessToken;

      expect(
        (await api(`/attempts/${attemptId}`, { token: studentFirst })).status,
      ).toBe(401);

      const state = await api<{
        responses: { questionId: string; answer: unknown }[];
      }>(`/attempts/${attemptId}`, { token: studentSecond });
      expect(state.status).toBe(200);
      expect(
        state.body.responses.find((r) => r.questionId === questionA)?.answer,
      ).toBe('A');
    });
  });

  describe('server-controlled timer (§2.2)', () => {
    it('the deadline is capped by the exam window, not the client', async () => {
      const student = await addStudent(tenant, 'Timer Cap', 'REL6');
      // 60-minute exam, but the window closes in ~2 minutes: the server must
      // take the earlier of the two.
      const { examId } = await createPublishedExam(tenant, {
        title: 'Window Capped Exam',
        durationMinutes: 60,
        questionIds: [questionA],
        endAt: new Date(Date.now() + 120_000).toISOString(),
      });

      const start = await api<{ remainingSeconds: number }>('/attempts', {
        method: 'POST',
        token: student,
        body: { examId },
      });

      expect(start.body.remainingSeconds).toBeGreaterThan(0);
      expect(start.body.remainingSeconds).toBeLessThanOrEqual(120);
    });

    it('auto-submits once time is up and refuses further answers', async () => {
      const student = await addStudent(tenant, 'Timer Expiry', 'REL7');
      // A short window so the attempt expires quickly, but wide enough that the
      // setup round-trips cannot eat it before the candidate starts.
      const { examId } = await createPublishedExam(tenant, {
        title: 'Expiring Exam',
        durationMinutes: 60,
        questionIds: [questionA],
        endAt: new Date(Date.now() + 25_000).toISOString(),
      });

      const start = await api<{ id: string; remainingSeconds: number }>(
        '/attempts',
        { method: 'POST', token: student, body: { examId } },
      );
      expect(start.status).toBe(201);
      const attemptId = start.body.id;

      // Trust the SERVER's clock, not the test's: wait out its own deadline.
      const remaining = start.body.remainingSeconds;
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(25);

      await api(`/attempts/${attemptId}/responses/${questionA}`, {
        method: 'PUT',
        token: student,
        body: { answer: 'A' },
      });

      await new Promise((resolve) =>
        setTimeout(resolve, (remaining + 2) * 1_000),
      );

      // Writing after expiry is refused...
      const late = await api(`/attempts/${attemptId}/responses/${questionA}`, {
        method: 'PUT',
        token: student,
        body: { answer: 'B' },
      });
      expect(late.status).toBe(400);

      // ...and the attempt has been auto-submitted with the answer intact.
      const state = await api<{
        status: string;
        remainingSeconds: number;
        responses: { questionId: string; answer: unknown }[];
      }>(`/attempts/${attemptId}`, { token: student });

      expect(state.body.status).toBe('AUTO_SUBMITTED');
      expect(state.body.remainingSeconds).toBe(0);
      expect(
        state.body.responses.find((r) => r.questionId === questionA)?.answer,
      ).toBe('A');
    });
  });
});
