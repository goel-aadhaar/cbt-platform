import {
  addStudent,
  api,
  createApprovedQuestion,
  expectStatus,
  setupTenant,
  type TenantFixture,
} from './support/client';

/**
 * Assessments / Practice Test (§ Product Structure) — the second exam
 * workflow, real end-to-end against the live server: no admin approval,
 * teacher-direct scheduling, auto-approved entry, the FULL configured
 * duration once admitted (the availability window gates entry only — it used
 * to also clamp the timer; that rule was removed, see the test below), an
 * immediately-visible individual result on submit, a leaderboard that waits
 * for the window to close, and the automatic close→evaluate→publish sweep
 * that remains the safety net for stragglers with no request or open browser
 * driving it.
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

  it('grants the FULL configured duration even when the window closes moments after starting', async () => {
    // 3 hours of duration, window closing in ~2 minutes — starting inside the
    // window is all that matters; per the product spec, "Availability Window
    // ≠ Exam Duration" and the exam is allowed to outlive its own window.
    const examId = await draftAssessment({ durationMinutes: 180 });
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
        endAt: new Date(Date.now() + 120_000).toISOString(),
      },
    });

    const studentToken = await addStudent(tenant, 'Full Duration', 'FD1');
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
    // ~180 minutes, generously bounded against request latency — NOT capped
    // to the ~2-minute window.
    expect(begun.body.remainingSeconds).toBeGreaterThan(179 * 60);
  });

  it('denies entry once the availability window has closed, even mid-second after it does', async () => {
    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    // endAt must be in the future to SCHEDULE at all — schedule a short
    // window, then wait it out before attempting entry.
    const closeAt = Date.now() + 3_000;
    await api(`/exams/${examId}/schedule-assessment`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: {
        startAt: new Date(Date.now() - 120_000).toISOString(),
        endAt: new Date(closeAt).toISOString(),
      },
    });

    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, closeAt - Date.now()) + 1_000),
    );

    const studentToken = await addStudent(tenant, 'Too Late', 'TL1');
    // requestEntry() checks `now > exam.endAt` before creating anything —
    // denied at the door, never reaching begin().
    const entry = await api('/attempts', {
      method: 'POST',
      token: studentToken,
      body: { examId },
    });
    expectStatus(entry, 400);
  }, 30_000);

  it('closes automatically at the window end and evaluates/ranks/publishes with no admin or browser involved', async () => {
    const examId = await draftAssessment();
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { batchId: tenant.batchId },
    });
    // Long enough that scheduling, addStudent's invite/accept/login round
    // trips, begin() and submit() all comfortably finish before the window
    // closes (addStudent alone is several sequential requests) — short
    // enough to still observe the sweep (every 30s) close it inside this
    // test's own timeout below.
    const closeAt = Date.now() + 45_000;
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

    /**
     * The headline behaviour change (§ Product Structure "immediate result"):
     * this student's OWN result is visible the instant they submit — no
     * admin/teacher publish step, and critically, no waiting for the window
     * above to close. Checked BEFORE any of the window-close waiting below.
     */
    // A 404 here means "not published yet" (getForStudent's own gate) — a
    // 200 with a real score is the whole point of this behaviour.
    const immediate = await api<{ totalScore: number; maxScore: number }>(
      `/attempts/${entry.body.id}/result`,
      { token: studentToken },
    );
    expectStatus(immediate, 200);
    expect(typeof immediate.body.totalScore).toBe('number');

    // The LEADERBOARD is the one piece that still waits — "published after
    // the test ends" — even though the individual result above did not.
    const tooEarly = await api(`/attempts/${entry.body.id}/leaderboard`, {
      token: studentToken,
    });
    expectStatus(tooEarly, 404);

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

    // Results published with nobody clicking anything (the sweep is a
    // no-op here since evaluate() already ran on submit, but it must still
    // succeed rather than error on an already-evaluated exam).
    const result = await api<{ published: boolean; totalScore: number }>(
      `/me/attempts`,
      { token: studentToken },
    );
    expectStatus(result, 200);
    const row = (
      result.body as unknown as { exam: { id: string }; result: unknown }[]
    ).find((r) => r.exam.id === examId);
    expect(row?.result).not.toBeNull();

    // Now that the window has closed, the leaderboard endpoint no longer
    // 404s — a single-candidate cohort still suppresses the BOARD itself
    // (below COHORT_MIN), but that is a documented "not enough candidates"
    // response, not "come back later".
    const afterClose = await api<{ available: boolean }>(
      `/attempts/${entry.body.id}/leaderboard`,
      { token: studentToken },
    );
    expectStatus(afterClose, 200);
    expect(afterClose.body.available).toBe(false);
  }, 100_000);

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
