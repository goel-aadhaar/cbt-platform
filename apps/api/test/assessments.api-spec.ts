import {
  addStudent,
  api,
  createApprovedQuestion,
  expectStatus,
  setupTenant,
  type TenantFixture,
} from './support/client';

/**
 * Assessments (§ Assessments) — the second exam workflow, real end-to-end
 * against the live server: no admin approval, teacher-direct scheduling,
 * auto-approved entry, the capped MIN(duration, window-remaining) timer, and
 * the automatic close→evaluate→publish pipeline with no request or open
 * browser driving it.
 */
describe('Assessments (§ Assessments)', () => {
  let tenant: TenantFixture;
  let questionId: string;

  beforeAll(async () => {
    tenant = await setupTenant('asmt');
    questionId = await createApprovedQuestion(tenant);

    // setupTenant() invites the teacher but never assigns them to a batch —
    // Assessment's batch-authorization check (§ Assessments) requires it,
    // unlike Mock Test's admin-driven assignment. Grant the fixture's own
    // batch here so the "authorized batch" tests below have one to use;
    // the "unauthorized batch" test creates a second batch precisely
    // because this one intentionally is not that.
    const me = await api<{ id: string }>('/auth/me', {
      token: tenant.teacherToken,
    });
    await api(`/staff/${me.body.id}/batches`, {
      method: 'PUT',
      token: tenant.adminToken,
      body: { batchIds: [tenant.batchId] },
    });
  });

  /** Creates a DRAFT assessment with one section/question, as the tenant's teacher. */
  async function draftAssessment(overrides: Record<string, unknown> = {}) {
    const created = await api<{ id: string; kind: string; status: string }>(
      '/exams',
      {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          kind: 'ASSESSMENT',
          title: `Assessment ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          durationMinutes: 60,
          ...overrides,
        },
      },
    );
    expectStatus(created, 201);
    const examId = created.body.id;

    const section = await api<{ id: string }>(`/exams/${examId}/sections`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { name: 'Physics' },
    });
    await api(`/exams/${examId}/sections/${section.body.id}/questions`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { questionId },
    });

    return examId;
  }

  it('is created directly as ASSESSMENT, with resultPolicy forced to IMMEDIATE', async () => {
    const examId = await draftAssessment({ resultPolicy: 'ON_PUBLISH' });
    const detail = await api<{
      kind: string;
      status: string;
      resultPolicy: string;
    }>(`/exams/${examId}`, { token: tenant.teacherToken });
    expectStatus(detail, 200);
    expect(detail.body.kind).toBe('ASSESSMENT');
    expect(detail.body.status).toBe('DRAFT');
    // The caller asked for ON_PUBLISH — the server overrides it, since
    // automatic publication is the entire point of this kind.
    expect(detail.body.resultPolicy).toBe('IMMEDIATE');
  });

  it('a teacher schedules-and-publishes their own assessment directly — no approval workflow at all', async () => {
    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });

    const scheduled = await api<{ status: string }>(
      `/exams/${examId}/schedule-assessment`,
      {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          startAt: new Date(Date.now() - 60_000).toISOString(),
          endAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
    );
    expectStatus(scheduled, 200);
    expect(scheduled.body.status).toBe('PUBLISHED');
  });

  it('the Mock Test approval endpoints all refuse an ASSESSMENT row', async () => {
    const examId = await draftAssessment();
    for (const call of [
      () =>
        api(`/exams/${examId}/submit`, {
          method: 'POST',
          token: tenant.teacherToken,
          body: { reviewerId: tenant.adminUserId },
        }),
      () =>
        api(`/exams/${examId}/approve`, {
          method: 'POST',
          token: tenant.adminToken,
        }),
      () =>
        api(`/exams/${examId}/reject`, {
          method: 'POST',
          token: tenant.adminToken,
        }),
      () =>
        api(`/exams/${examId}/start`, {
          method: 'POST',
          token: tenant.adminToken,
        }),
      () =>
        api(`/exams/${examId}/publish`, {
          method: 'POST',
          token: tenant.adminToken,
        }),
    ]) {
      const res = await call();
      expect(res.status).toBe(400);
    }
  });

  it('scheduleAssessment refuses a Mock Test row, and refuses scheduling twice', async () => {
    const mockExam = await api<{ id: string }>('/exams', {
      method: 'POST',
      token: tenant.teacherToken,
      body: { title: 'Not an assessment', durationMinutes: 60 },
    });
    const wrongKind = await api(
      `/exams/${mockExam.body.id}/schedule-assessment`,
      {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
    );
    expect(wrongKind.status).toBe(400);

    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    const body = {
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    const first = await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body,
    });
    expectStatus(first, 200);
    const second = await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body,
    });
    // Already PUBLISHED, not DRAFT — the double-submit/double-click guard.
    expect(second.status).toBe(400);
  });

  it("a teacher cannot assign a batch they aren't authorized for", async () => {
    // A second batch this tenant's teacher was never assigned to.
    const otherClass = await api<{ id: string }>('/classes', {
      method: 'POST',
      token: tenant.adminToken,
      body: { programId: tenant.programId, name: 'Class 11' },
    });
    const otherBatch = await api<{ id: string }>('/batches', {
      method: 'POST',
      token: tenant.adminToken,
      body: { classId: otherClass.body.id, name: 'Beta' },
    });

    const examId = await draftAssessment();
    const res = await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: otherBatch.body.id },
    });
    expect(res.status).toBe(403);
  });

  it('a student in the assigned batch is auto-approved on entry — no PENDING_APPROVAL, no admin action', async () => {
    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: {
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    const studentToken = await addStudent(tenant, 'Auto Approve', 'AA1');
    const entry = await api<{ id: string; status: string }>('/attempts', {
      method: 'POST',
      token: studentToken,
      body: { examId },
    });
    expectStatus(entry, 201);
    expect(entry.body.status).toBe('APPROVED');

    const begun = await api<{ remainingSeconds: number }>(
      `/attempts/${entry.body.id}/begin`,
      { method: 'POST', token: studentToken },
    );
    expectStatus(begun, 200);
    // ~60 minutes, generously bounded against request latency.
    expect(begun.body.remainingSeconds).toBeGreaterThan(59 * 60);
  });

  it('the timer is capped at the remaining window, not the full configured duration', async () => {
    const examId = await draftAssessment({ durationMinutes: 180 });
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    // 3 hours of duration, but the window closes in ~2 minutes.
    await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: {
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 120_000).toISOString(),
      },
    });

    const studentToken = await addStudent(tenant, 'Capped Timer', 'CT1');
    const entry = await api<{ id: string }>('/attempts', {
      method: 'POST',
      token: studentToken,
      body: { examId },
    });
    const begun = await api<{ remainingSeconds: number }>(
      `/attempts/${entry.body.id}/begin`,
      { method: 'POST', token: studentToken },
    );
    expectStatus(begun, 200);
    // Capped near the ~2-minute window, nowhere near the 3-hour duration.
    expect(begun.body.remainingSeconds).toBeLessThan(130);
    expect(begun.body.remainingSeconds).toBeGreaterThan(90);
  });

  it('closes automatically at the window end and evaluates/ranks/publishes with no admin or browser involved', async () => {
    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    // A short-enough window to actually observe the sweep (every 30s) close
    // it inside this test's timeout, without the attempt itself timing out
    // before the student can submit.
    const closeAt = Date.now() + 20_000;
    await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: {
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(closeAt).toISOString(),
      },
    });

    const studentToken = await addStudent(tenant, 'Auto Close', 'AC1');
    const entry = await api<{ id: string }>('/attempts', {
      method: 'POST',
      token: studentToken,
      body: { examId },
    });
    await api(`/attempts/${entry.body.id}/begin`, {
      method: 'POST',
      token: studentToken,
    });
    const submitted = await api(`/attempts/${entry.body.id}/submit`, {
      method: 'POST',
      token: studentToken,
    });
    // attempts.controller.ts's submit() is @HttpCode(HttpStatus.OK).
    expectStatus(submitted, 200);

    // Trust the SERVER's clock, not the test's — wait out its own window,
    // then give the 30s sweep interval room to actually tick.
    const waitMs = Math.max(0, closeAt - Date.now()) + 35_000;
    const deadline = Date.now() + waitMs;
    let status = '';
    while (Date.now() < deadline) {
      const exam = await api<{ status: string }>(`/exams/${examId}`, {
        token: tenant.teacherToken,
      });
      status = exam.body.status;
      if (status === 'ARCHIVED') break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    expect(status).toBe('ARCHIVED');

    // Results and the leaderboard published with nobody clicking anything.
    const result = await api<{ published: boolean; totalScore: number }>(
      `/me/attempts`,
      { token: studentToken },
    );
    expectStatus(result, 200);
    const row = (
      result.body as unknown as { exam: { id: string }; result: unknown }[]
    ).find((r) => r.exam.id === examId);
    expect(row?.result).not.toBeNull();
  }, 60_000);

  it('tenant isolation: another institute cannot see, join, or read this assessment', async () => {
    const other = await setupTenant('asmt-other');
    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: {
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    const otherDetail = await api(`/exams/${examId}`, {
      token: other.teacherToken,
    });
    expect(otherDetail.status).toBe(404);

    const otherStudentToken = await addStudent(other, 'Outsider', 'OUT1');
    const entryAttempt = await api('/attempts', {
      method: 'POST',
      token: otherStudentToken,
      body: { examId },
    });
    expect(entryAttempt.status).toBe(404);

    const list = await api<{ items: { id: string }[] }>('/exams', {
      token: other.teacherToken,
      query: { kind: 'ASSESSMENT' },
    });
    expectStatus(list, 200);
    expect(list.body.items.some((e) => e.id === examId)).toBe(false);
  });
});
