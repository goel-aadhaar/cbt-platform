import {
  addStudent,
  api,
  createApprovedQuestion,
  ensureChapterId,
  ensureSubjectId,
  expectStatus,
  setupTenant,
  type TenantFixture,
} from './support/client';

/**
 * Daily Practice Papers (§ Product Structure) end to end.
 *
 * The unit spec beside DppService (`dpp-authorization.spec.ts`) pins the
 * authorization ALGEBRA; this pins what only a real database can answer —
 * that a batch filter survives an actual Prisma join, that a student cannot
 * reach a DPP their batch was never assigned, and that one institute's DPPs
 * are unreachable (not merely hidden) from another.
 */

interface DppRow {
  id: string;
  title: string;
  batches: { id: string; name: string }[];
  _count: { questions: number };
}

describe('DPP', () => {
  let tenant: TenantFixture;
  let betaBatchId: string;
  let alphaStudent: string;
  let betaStudent: string;
  let questionA: string;
  let questionB: string;
  let teacherUserId: string;

  beforeAll(async () => {
    tenant = await setupTenant('dpp');

    const beta = await api<{ id: string }>('/batches', {
      method: 'POST',
      token: tenant.adminToken,
      body: { classId: tenant.classId, name: 'Beta' },
    });
    expectStatus(beta, 201);
    betaBatchId = beta.body.id;

    [alphaStudent, betaStudent] = await Promise.all([
      addStudent(tenant, 'Alpha Candidate', 'DPPA', tenant.batchId),
      addStudent(tenant, 'Beta Candidate', 'DPPB', betaBatchId),
    ]);

    questionA = await createApprovedQuestion(tenant, {
      statement: 'What is the SI unit of force?',
    });
    questionB = await createApprovedQuestion(tenant, {
      statement: 'What is the SI unit of energy?',
    });

    const me = await api<{ id: string }>('/auth/me', {
      token: tenant.teacherToken,
    });
    expectStatus(me, 200);
    teacherUserId = me.body.id;
    await api(`/staff/${teacherUserId}/batches`, {
      method: 'PUT',
      token: tenant.adminToken,
      body: { batchIds: [tenant.batchId] },
    });
  }, 300_000);

  describe('creation and question reuse', () => {
    it('creates a DPP referencing existing questions, not copies', async () => {
      const res = await api<DppRow>('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Mechanics P1 DPP',
          questionIds: [questionA, questionB],
          batchIds: [tenant.batchId],
        },
      });
      expectStatus(res, 201);
      expect(res.body._count.questions).toBe(2);
      expect(res.body.batches.map((b) => b.id)).toEqual([tenant.batchId]);

      // The same question can also still be used in an exam — DPP does not
      // remove it from the bank or from exam eligibility.
      const question = await api(`/questions/${questionA}`, {
        token: tenant.adminToken,
      });
      expectStatus(question, 200);
    });

    it('refuses an unapproved question', async () => {
      const subjectId = await ensureSubjectId(tenant, 'Physics');
      const chapterId = await ensureChapterId(tenant, subjectId, 'Mechanics');
      const draft = await api<{ id: string }>('/questions', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          subjectId,
          chapterId,
          difficulty: 'EASY',
          type: 'MCQ',
          statement: 'Still a draft',
          options: [
            { key: 'A', text: 'X' },
            { key: 'B', text: 'Y' },
          ],
          answerKey: 'A',
        },
      });
      expectStatus(draft, 201);

      const res = await api('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Should not be created',
          questionIds: [draft.body.id],
          batchIds: [tenant.batchId],
        },
      });
      expectStatus(res, 400);
    });

    it('requires at least one batch', async () => {
      const res = await api('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Shared with nobody',
          questionIds: [questionA],
          batchIds: [],
        },
      });
      expectStatus(res, 400);
    });
  });

  describe('teacher batch authorization', () => {
    it('lets a teacher share with a batch they teach', async () => {
      const res = await api<DppRow>('/dpps', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Teacher DPP',
          questionIds: [questionA],
          batchIds: [tenant.batchId],
        },
      });
      expectStatus(res, 201);
    });

    it('refuses a batch the teacher does not teach', async () => {
      const res = await api('/dpps', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Not mine to share',
          questionIds: [questionA],
          batchIds: [betaBatchId],
        },
      });
      expectStatus(res, 403);
    });

    it('refuses the whole request when only one batch is unauthorized', async () => {
      const before = await api<DppRow[]>('/dpps', { token: tenant.adminToken });
      expectStatus(before, 200);

      const res = await api('/dpps', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Half allowed',
          questionIds: [questionA],
          batchIds: [tenant.batchId, betaBatchId],
        },
      });
      expectStatus(res, 403);

      const after = await api<DppRow[]>('/dpps', { token: tenant.adminToken });
      expectStatus(after, 200);
      expect(after.body.length).toBe(before.body.length);
    });
  });

  describe('student visibility and batch isolation', () => {
    let dppId: string;

    it('a batch-assigned DPP reaches the student in that batch', async () => {
      const created = await api<DppRow>('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Alpha-only DPP',
          questionIds: [questionA, questionB],
          batchIds: [tenant.batchId],
        },
      });
      expectStatus(created, 201);
      dppId = created.body.id;

      const mine = await api<{ id: string; questionCount: number }[]>(
        '/me/dpps',
        { token: alphaStudent },
      );
      expectStatus(mine, 200);
      const row = mine.body.find((d) => d.id === dppId);
      expect(row).toBeDefined();
      expect(row!.questionCount).toBe(2);
    });

    it('does not reach a student in another batch', async () => {
      const theirs = await api<{ id: string }[]>('/me/dpps', {
        token: betaStudent,
      });
      expectStatus(theirs, 200);
      expect(theirs.body.map((d) => d.id)).not.toContain(dppId);
    });

    it('lets the assigned student open a session, but not the other batch', async () => {
      const opened = await api<{ session: { id: string }; items: unknown[] }>(
        '/practice/sessions',
        { method: 'POST', token: alphaStudent, body: { dppId } },
      );
      expectStatus(opened, 201);
      expect(opened.body.items).toHaveLength(2);

      // Not merely absent from the list — unreachable by id directly.
      const denied = await api('/practice/sessions', {
        method: 'POST',
        token: betaStudent,
        body: { dppId },
      });
      expectStatus(denied, 404);
    });

    it('answering reveals the key only for that question, and records progress', async () => {
      const opened = await api<{ session: { id: string } }>(
        '/practice/sessions',
        { method: 'POST', token: alphaStudent, body: { dppId } },
      );
      expectStatus(opened, 201);
      const sessionId = opened.body.session.id;

      const answered = await api<{ correct: boolean; correctAnswer: string }>(
        `/practice/sessions/${sessionId}/answer`,
        {
          method: 'POST',
          token: alphaStudent,
          body: { questionId: questionA, answer: 'A' },
        },
      );
      expectStatus(answered, 200);
      expect(answered.body.correctAnswer).toBe('A');

      const completed = await api<{ answered: number; correct: number }>(
        `/practice/sessions/${sessionId}/complete`,
        { method: 'POST', token: alphaStudent, body: { durationSeconds: 30 } },
      );
      expectStatus(completed, 200);
      expect(completed.body.answered).toBe(1);
    });

    it('a diagram on a DPP question is only readable by the assigned batch', async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
          type: 'image/png',
        }),
        'diagram.png',
      );
      const uploaded = await api<{ key: string }>('/media', {
        method: 'POST',
        token: tenant.adminToken,
        form,
      });
      expectStatus(uploaded, 201);
      const key = uploaded.body.key;

      const withDiagram = await createApprovedQuestion(tenant, {
        statement: 'Identify the labelled part in the diagram.',
        mediaKeys: [key],
      });
      const dppWithMedia = await api<DppRow>('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Diagram DPP',
          questionIds: [withDiagram],
          batchIds: [tenant.batchId],
        },
      });
      expectStatus(dppWithMedia, 201);

      expectStatus(
        await api(`/media/file/${encodeURIComponent(key)}`, {
          token: alphaStudent,
        }),
        200,
      );
      expectStatus(
        await api(`/media/file/${encodeURIComponent(key)}`, {
          token: betaStudent,
        }),
        404,
      );
    });
  });

  describe('across institutes', () => {
    it('never shows one institute the DPPs of another', async () => {
      const other = await setupTenant('dpp2');
      const theirQuestion = await createApprovedQuestion(other);
      const theirs = await api<DppRow>('/dpps', {
        method: 'POST',
        token: other.adminToken,
        body: {
          title: "Other institute's DPP",
          questionIds: [theirQuestion],
          batchIds: [other.batchId],
        },
      });
      expectStatus(theirs, 201);

      const mine = await api<DppRow[]>('/dpps', { token: tenant.adminToken });
      expectStatus(mine, 200);
      expect(mine.body.map((d) => d.id)).not.toContain(theirs.body.id);

      expectStatus(
        await api(`/dpps/${theirs.body.id}`, { token: tenant.adminToken }),
        404,
      );
      expectStatus(
        await api(`/dpps/${theirs.body.id}`, {
          method: 'DELETE',
          token: tenant.adminToken,
        }),
        404,
      );
      // Still there for the institute that owns it.
      expectStatus(
        await api(`/dpps/${theirs.body.id}`, { token: other.adminToken }),
        200,
      );
    });

    it('refuses a batch from another institute', async () => {
      const other = await setupTenant('dpp3');
      const res = await api('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Cross-tenant DPP',
          questionIds: [questionA],
          batchIds: [other.batchId],
        },
      });
      expectStatus(res, 400);
    });
  });

  describe('deleting', () => {
    it('stops students seeing it, and leaves the question in the bank', async () => {
      const created = await api<DppRow>('/dpps', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Withdrawn DPP',
          questionIds: [questionA],
          batchIds: [tenant.batchId],
        },
      });
      expectStatus(created, 201);

      expectStatus(
        await api(`/dpps/${created.body.id}`, {
          method: 'DELETE',
          token: tenant.adminToken,
        }),
        200,
      );
      const mine = await api<{ id: string }[]>('/me/dpps', {
        token: alphaStudent,
      });
      expectStatus(mine, 200);
      expect(mine.body.map((d) => d.id)).not.toContain(created.body.id);

      const question = await api(`/questions/${questionA}`, {
        token: tenant.adminToken,
      });
      expectStatus(question, 200);
    });

    it('does not let a student delete anything', async () => {
      const list = await api<DppRow[]>('/dpps', { token: tenant.adminToken });
      expectStatus(list, 200);
      expect(list.body.length).toBeGreaterThan(0);

      // The class-level @Roles(ADMIN, TEACHER) guard on DppController
      // refuses a STUDENT session before the request ever reaches the
      // service.
      const res = await api(`/dpps/${list.body[0].id}`, {
        method: 'DELETE',
        token: alphaStudent,
      });
      expectStatus(res, 403);
    });
  });
});
