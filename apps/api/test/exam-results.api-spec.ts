import {
  addStudent,
  api,
  createApprovedQuestion,
  createPublishedExam,
  setupTenant,
  TenantFixture,
} from './support/client';

/**
 * Functional coverage (§2.17) of the platform's core: assembling an exam (§2.3),
 * sitting it (§2.2), and the Result & Ranking engine (§2.8, §2.9, §2.5).
 *
 * One exam is sat by three candidates with known answers, so every downstream
 * number (marks, counts, ranks, percentile) has a hand-checkable expected value.
 */
describe('Exam lifecycle and results engine', () => {
  let tenant: TenantFixture;
  let q1: string;
  let q2: string;
  let examId: string;
  const attempts: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  // Heavy fixture: an institute, staff, two questions, a published exam and
  // three candidates who each sit it — ~50 round-trips to the database.
  beforeAll(async () => {
    tenant = await setupTenant('exr');
    q1 = await createApprovedQuestion(tenant, { statement: 'Question one?' });
    q2 = await createApprovedQuestion(tenant, { statement: 'Question two?' });

    ({ examId } = await createPublishedExam(tenant, {
      title: 'Ranked Mock',
      questionIds: [q1, q2],
    }));

    // Default marking is +4 / -1. Answers are chosen so scores are 8, 3 and 0.
    const plan: [string, string, string | null, string | null][] = [
      ['TOP', 'Top Scorer', 'A', 'A'], //  +4 +4 = 8
      ['MID', 'Mid Scorer', 'A', 'B'], //  +4 -1 = 3
      ['LOW', 'Non Starter', null, null], // unattempted = 0
    ];

    for (const [roll, name, a1, a2] of plan) {
      const token = await addStudent(tenant, name, roll);
      tokens[roll] = token;

      const start = await api<{ id: string }>('/attempts', {
        method: 'POST',
        token,
        body: { examId },
      });
      const attemptId = start.body.id;
      attempts[roll] = attemptId;

      if (a1) {
        await api(`/attempts/${attemptId}/responses/${q1}`, {
          method: 'PUT',
          token,
          body: { answer: a1 },
        });
      }
      if (a2) {
        await api(`/attempts/${attemptId}/responses/${q2}`, {
          method: 'PUT',
          token,
          body: { answer: a2 },
        });
      }
      await api(`/attempts/${attemptId}/submit`, { method: 'POST', token });
    }
  }, 300_000);

  describe('answer-key secrecy (critical)', () => {
    it('the candidate exam state never exposes answer keys or explanations', async () => {
      const token = await addStudent(tenant, 'Peeker', 'PEEK');
      const { examId: peekExam } = await createPublishedExam(tenant, {
        title: 'Peek Exam',
        questionIds: [q1, q2],
      });
      const start = await api('/attempts', {
        method: 'POST',
        token,
        body: { examId: peekExam },
      });

      const serialised = JSON.stringify(start.body);
      expect(serialised).not.toContain('answerKey');
      expect(serialised).not.toContain('answer_key');
      expect(serialised).not.toContain('explanation');
    });
  });

  describe('exam assembly and publish gating (§2.3)', () => {
    it('refuses to publish an exam with no sections or questions', async () => {
      const exam = await api<{ id: string }>('/exams', {
        method: 'POST',
        token: tenant.teacherToken,
        body: { title: 'Empty Exam', durationMinutes: 60 },
      });
      const res = await api(`/exams/${exam.body.id}/publish`, {
        method: 'POST',
        token: tenant.adminToken,
      });
      expect(res.status).toBe(400);
    });

    it('refuses to publish without a schedule and a batch', async () => {
      const exam = await api<{ id: string }>('/exams', {
        method: 'POST',
        token: tenant.teacherToken,
        body: { title: 'Unscheduled Exam', durationMinutes: 60 },
      });
      const section = await api<{ id: string }>(
        `/exams/${exam.body.id}/sections`,
        { method: 'POST', token: tenant.teacherToken, body: { name: 'S' } },
      );
      await api(
        `/exams/${exam.body.id}/sections/${section.body.id}/questions`,
        {
          method: 'POST',
          token: tenant.teacherToken,
          body: { questionId: q1 },
        },
      );

      const res = await api(`/exams/${exam.body.id}/publish`, {
        method: 'POST',
        token: tenant.adminToken,
      });
      expect(res.status).toBe(400);
    });

    it('rejects a question that is not APPROVED (§2.4)', async () => {
      const draft = await api<{ id: string }>('/questions', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          subject: 'Physics',
          chapter: 'Heat',
          difficulty: 'EASY',
          type: 'MCQ',
          examType: 'NEET',
          statement: 'Still a draft?',
          options: [
            { key: 'A', text: '1' },
            { key: 'B', text: '2' },
          ],
          answerKey: 'A',
        },
      });
      const exam = await api<{ id: string }>('/exams', {
        method: 'POST',
        token: tenant.teacherToken,
        body: { title: 'Draft Question Exam', durationMinutes: 60 },
      });
      const section = await api<{ id: string }>(
        `/exams/${exam.body.id}/sections`,
        { method: 'POST', token: tenant.teacherToken, body: { name: 'S' } },
      );

      const res = await api(
        `/exams/${exam.body.id}/sections/${section.body.id}/questions`,
        {
          method: 'POST',
          token: tenant.teacherToken,
          body: { questionId: draft.body.id },
        },
      );
      expect(res.status).toBe(400);
    });

    it('clones an exam into a fresh draft without batches or schedule (§2.3)', async () => {
      const res = await api<{
        title: string;
        status: string;
        startAt: string | null;
        _count: { sections: number; questions: number; batches: number };
      }>(`/exams/${examId}/clone`, {
        method: 'POST',
        token: tenant.teacherToken,
        body: { title: 'Cloned Mock' },
      });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Cloned Mock');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body._count.sections).toBe(1);
      expect(res.body._count.questions).toBe(2);
      expect(res.body._count.batches).toBe(0);
      expect(res.body.startAt).toBeNull();
    });
  });

  describe('sitting the exam (§2.2)', () => {
    it('a submitted attempt is locked against further answers', async () => {
      const res = await api(`/attempts/${attempts.TOP}/responses/${q1}`, {
        method: 'PUT',
        token: tokens.TOP,
        body: { answer: 'B' },
      });
      expect(res.status).toBe(400);
    });

    it('a student not assigned to the exam batch cannot start it', async () => {
      const otherBatch = await api<{ id: string }>('/batches', {
        method: 'POST',
        token: tenant.adminToken,
        body: { classId: tenant.classId, name: 'Beta' },
      });
      const outsider = await addStudent(
        tenant,
        'Outsider',
        'OUT1',
        otherBatch.body.id,
      );

      const res = await api('/attempts', {
        method: 'POST',
        token: outsider,
        body: { examId },
      });
      expect(res.status).toBe(403);
    });

    it('an unpublished exam cannot be started', async () => {
      const exam = await api<{ id: string }>('/exams', {
        method: 'POST',
        token: tenant.teacherToken,
        body: { title: 'Draft Exam', durationMinutes: 60 },
      });
      const student = await addStudent(tenant, 'Early Bird', 'EARLY');

      const res = await api('/attempts', {
        method: 'POST',
        token: student,
        body: { examId: exam.body.id },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('evaluation, ranking and percentile (§2.8)', () => {
    it('scores each attempt with the section marking scheme', async () => {
      const evaluated = await api<{ evaluated: number; maxScore: number }>(
        `/exams/${examId}/evaluate`,
        { method: 'POST', token: tenant.adminToken },
      );
      expect(evaluated.status).toBe(200);
      expect(evaluated.body.evaluated).toBe(3);
      expect(evaluated.body.maxScore).toBe(8);

      const results = await api<
        {
          totalScore: number;
          correctCount: number;
          incorrectCount: number;
          unattemptedCount: number;
          overallRank: number;
          batchRank: number;
          percentile: number;
          student: { rollNumber: string };
        }[]
      >(`/exams/${examId}/results`, { token: tenant.adminToken });

      const byRoll = Object.fromEntries(
        results.body.map((r) => [r.student.rollNumber, r]),
      );

      // +4 / -1 marking, hand-checked.
      expect(byRoll.TOP.totalScore).toBe(8);
      expect(byRoll.TOP.correctCount).toBe(2);
      expect(byRoll.MID.totalScore).toBe(3);
      expect(byRoll.MID.correctCount).toBe(1);
      expect(byRoll.MID.incorrectCount).toBe(1);
      expect(byRoll.LOW.totalScore).toBe(0);
      expect(byRoll.LOW.unattemptedCount).toBe(2);
    });

    it('ranks candidates overall and within their batch', async () => {
      const results = await api<
        {
          overallRank: number;
          batchRank: number;
          student: { rollNumber: string };
        }[]
      >(`/exams/${examId}/results`, { token: tenant.adminToken });
      const byRoll = Object.fromEntries(
        results.body.map((r) => [r.student.rollNumber, r]),
      );

      expect(byRoll.TOP.overallRank).toBe(1);
      expect(byRoll.MID.overallRank).toBe(2);
      expect(byRoll.LOW.overallRank).toBe(3);
      // All three sit in the same batch, so batch rank mirrors overall rank.
      expect(byRoll.TOP.batchRank).toBe(1);
      expect(byRoll.LOW.batchRank).toBe(3);
    });

    it('computes NTA-style percentiles', async () => {
      const results = await api<
        { percentile: number; student: { rollNumber: string } }[]
      >(`/exams/${examId}/results`, { token: tenant.adminToken });
      const byRoll = Object.fromEntries(
        results.body.map((r) => [r.student.rollNumber, r]),
      );

      // (candidates scoring <= me) / total * 100
      expect(byRoll.TOP.percentile).toBeCloseTo(100, 1);
      expect(byRoll.MID.percentile).toBeCloseTo(66.67, 1);
      expect(byRoll.LOW.percentile).toBeCloseTo(33.33, 1);
    });
  });

  describe('result publishing controls (§2.8)', () => {
    it('holds results from students until published', async () => {
      const held = await api(`/attempts/${attempts.TOP}/result`, {
        token: tokens.TOP,
      });
      expect(held.status).toBe(404);
    });

    it('releases results once published', async () => {
      const published = await api(`/exams/${examId}/results/publish`, {
        method: 'POST',
        token: tenant.adminToken,
      });
      expect(published.status).toBe(200);

      const res = await api<{ totalScore: number; overallRank: number }>(
        `/attempts/${attempts.TOP}/result`,
        { token: tokens.TOP },
      );
      expect(res.status).toBe(200);
      expect(res.body.totalScore).toBe(8);
      expect(res.body.overallRank).toBe(1);
    });

    it('a student cannot read another candidate’s result', async () => {
      const res = await api(`/attempts/${attempts.MID}/result`, {
        token: tokens.TOP,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('grace marks and remediation (§2.9, §2.5)', () => {
    it('BONUS awards full marks to every candidate and re-ranks', async () => {
      await api(`/exams/${examId}/questions/${q2}/scoring`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { override: 'BONUS' },
      });
      await api(`/exams/${examId}/evaluate`, {
        method: 'POST',
        token: tenant.adminToken,
      });

      const results = await api<
        { totalScore: number; student: { rollNumber: string } }[]
      >(`/exams/${examId}/results`, { token: tenant.adminToken });
      const byRoll = Object.fromEntries(
        results.body.map((r) => [r.student.rollNumber, r]),
      );

      // Everyone now gets q2's +4: 8, 3-(-1)+4 => 4+4=8, and 0+4=4.
      expect(byRoll.TOP.totalScore).toBe(8);
      expect(byRoll.MID.totalScore).toBe(8);
      expect(byRoll.LOW.totalScore).toBe(4);
    });

    it('DROPPED removes the question from scoring and from the max marks', async () => {
      await api(`/exams/${examId}/questions/${q2}/scoring`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { override: 'DROPPED' },
      });
      const evaluated = await api<{ maxScore: number }>(
        `/exams/${examId}/evaluate`,
        { method: 'POST', token: tenant.adminToken },
      );

      expect(evaluated.body.maxScore).toBe(4);

      const results = await api<
        { totalScore: number; student: { rollNumber: string } }[]
      >(`/exams/${examId}/results`, { token: tenant.adminToken });
      const byRoll = Object.fromEntries(
        results.body.map((r) => [r.student.rollNumber, r]),
      );
      expect(byRoll.TOP.totalScore).toBe(4);
      expect(byRoll.MID.totalScore).toBe(4);
      expect(byRoll.LOW.totalScore).toBe(0);
    });

    it('MANUAL evaluation applies the admin’s per-candidate award', async () => {
      await api(`/exams/${examId}/questions/${q2}/scoring`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { override: 'MANUAL' },
      });
      await api(`/exams/${examId}/results/manual`, {
        method: 'PUT',
        token: tenant.adminToken,
        body: { attemptId: attempts.MID, questionId: q2, marks: 2 },
      });
      await api(`/exams/${examId}/evaluate`, {
        method: 'POST',
        token: tenant.adminToken,
      });

      const results = await api<
        {
          totalScore: number;
          maxScore: number;
          student: { rollNumber: string };
        }[]
      >(`/exams/${examId}/results`, { token: tenant.adminToken });
      const byRoll = Object.fromEntries(
        results.body.map((r) => [r.student.rollNumber, r]),
      );

      // Max marks still count the question; only the award is manual.
      expect(byRoll.MID.maxScore).toBe(8);
      expect(byRoll.MID.totalScore).toBe(6); // 4 (q1) + 2 (manual award)
      expect(byRoll.TOP.totalScore).toBe(4); // 4 (q1) + 0 (no award)
    });
  });

  describe('exports (§2.14)', () => {
    it.each([
      ['csv', 'text/csv'],
      ['xlsx', 'spreadsheetml'],
      ['pdf', 'application/pdf'],
    ])('exports the ranked result sheet as %s', async (format, mime) => {
      const res = await api(`/exams/${examId}/results/export/${format}`, {
        token: tenant.adminToken,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain(mime);
      expect(res.headers.get('content-disposition')).toContain('attachment');
    });

    it('a teacher cannot export results (admin only)', async () => {
      const res = await api(`/exams/${examId}/results/export/csv`, {
        token: tenant.teacherToken,
      });
      expect(res.status).toBe(403);
    });
  });
});
