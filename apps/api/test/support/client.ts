import { readFileSync } from 'node:fs';

import { API_LOG_FILE, V1 } from './paths';

export const SUPERADMIN = {
  email: 'superadmin@drsk.local',
  password: 'ChangeMe123!',
};
/** Password every user created by the suite sets when accepting their invite. */
export const PASSWORD = 'TestPass1234';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  form?: FormData;
}

/** Issue a request against the running API. Never throws on non-2xx. */
export async function api<T = any>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = new URL(V1 + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed as T, headers: res.headers };
}

/** Fails the calling test with the response body when the status is unexpected. */
export function expectStatus(res: ApiResponse, expected: number): void {
  if (res.status !== expected) {
    throw new Error(
      `Expected ${expected} but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
}

// --- Invitation links + OTP codes (the dev mail adapter prints both to the app log) ---

function inviteTokens(): string[] {
  const log = readFileSync(API_LOG_FILE, 'utf8');
  return [...log.matchAll(/token=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
}

export function countInviteTokens(): number {
  return inviteTokens().length;
}

async function waitForNewInviteToken(before: number): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const tokens = inviteTokens();
    if (tokens.length > before) return tokens[tokens.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for an invitation token in the API log');
}

function otpCodes(): string[] {
  const log = readFileSync(API_LOG_FILE, 'utf8');
  return [...log.matchAll(/code: (\d{6})/g)].map((m) => m[1]);
}

export function countOtpCodes(): number {
  return otpCodes().length;
}

/** jest-api.json runs with maxWorkers: 1, so "the newest code so far" is
 * always the one just issued — no need to correlate by email. */
export async function waitForNewOtpCode(before: number): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const codes = otpCodes();
    if (codes.length > before) return codes[codes.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for an OTP code in the API log');
}

/**
 * Waits for `count` new invitation tokens (used after a bulk CSV import, where
 * one request creates many students). Tokens are returned in emission order,
 * which matches the CSV row order.
 */
export async function waitForInviteTokens(
  before: number,
  count: number,
  timeoutMs = 120_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tokens = inviteTokens();
    if (tokens.length >= before + count) {
      return tokens.slice(before, before + count);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${count} invitation tokens`);
}

// --- Domain builders -------------------------------------------------------

interface OtpChallengeResponse {
  otpRequired: true;
  challengeId: string;
  expiresAt: string;
  sentTo: string;
}

/**
 * Every non-student door is two steps (§2.2): a correct password only earns
 * a mailed code, which POST /auth/login/verify redeems for the real session.
 * The dev mail adapter prints the code to the API log instead of sending it.
 */
async function completeOtpLogin(
  loginPath: string,
  body: { email: string; password: string },
): Promise<string> {
  const before = otpCodes().length;
  const challenge = await api<OtpChallengeResponse>(loginPath, {
    method: 'POST',
    body,
  });
  if (challenge.status !== 200) {
    throw new Error(
      `${loginPath} failed (${challenge.status}): ${JSON.stringify(challenge.body)}`,
    );
  }
  const code = await waitForNewOtpCode(before);
  const verified = await api<{ accessToken: string }>('/auth/login/verify', {
    method: 'POST',
    body: { challengeId: challenge.body.challengeId, code },
  });
  expectStatus(verified, 200);
  return verified.body.accessToken;
}

export async function loginSuperadmin(): Promise<string> {
  // The platform owner has its own door; /auth/login refuses SUPERADMIN.
  try {
    return await completeOtpLogin('/auth/platform/login', SUPERADMIN);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Superadmin login failed. Seed the database first: pnpm --filter @drsk/api db:seed (${reason})`,
    );
  }
}

export async function loginStaff(
  email: string,
  password: string = PASSWORD,
): Promise<string> {
  return completeOtpLogin('/auth/login', { email, password });
}

export interface TenantFixture {
  suffix: string;
  slug: string;
  instituteId: string;
  superToken: string;
  adminToken: string;
  adminUserId: string;
  teacherToken: string;
  programId: string;
  classId: string;
  batchId: string;
}

/** Creates an isolated institute with an admin, a teacher and one batch. */
export async function setupTenant(label = 't'): Promise<TenantFixture> {
  const suffix = `${label}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const slug = `inst-${suffix}`;
  const superToken = await loginSuperadmin();

  const institute = await api<{ id: string }>('/institutes', {
    method: 'POST',
    token: superToken,
    body: { name: `Institute ${suffix}`, slug },
  });
  expectStatus(institute, 201);
  const instituteId = institute.body.id;

  const adminEmail = `admin-${suffix}@test.local`;
  await inviteAndAccept(
    '/invitations/admin',
    { name: 'Test Admin', email: adminEmail, instituteId },
    superToken,
  );
  const adminToken = await loginStaff(adminEmail);
  const adminMe = await api<{ id: string }>('/auth/me', { token: adminToken });
  const adminUserId = adminMe.body.id;

  const teacherEmail = `teacher-${suffix}@test.local`;
  await inviteAndAccept(
    '/invitations/teacher',
    { name: 'Test Teacher', email: teacherEmail },
    adminToken,
  );
  const teacherToken = await loginStaff(teacherEmail);

  const program = await api<{ id: string }>('/programs', {
    method: 'POST',
    token: adminToken,
    body: { name: 'NEET' },
  });
  const klass = await api<{ id: string }>('/classes', {
    method: 'POST',
    token: adminToken,
    body: { programId: program.body.id, name: 'Class 12' },
  });
  const batch = await api<{ id: string }>('/batches', {
    method: 'POST',
    token: adminToken,
    body: { classId: klass.body.id, name: 'Alpha' },
  });

  return {
    suffix,
    slug,
    instituteId,
    superToken,
    adminToken,
    adminUserId,
    teacherToken,
    programId: program.body.id,
    classId: klass.body.id,
    batchId: batch.body.id,
  };
}

/** Returns the invite response body — callers that need it (e.g. the
 * server-generated roll number) read it off there; the rest just await. */
async function inviteAndAccept(
  path: string,
  body: Record<string, unknown>,
  inviterToken: string,
): Promise<Record<string, unknown>> {
  const before = countInviteTokens();
  const invite = await api(path, { method: 'POST', token: inviterToken, body });
  if (invite.status >= 300) {
    throw new Error(
      `Invite ${path} failed (${invite.status}): ${JSON.stringify(invite.body)}`,
    );
  }
  const token = await waitForNewInviteToken(before);
  const accept = await api('/invitations/accept', {
    method: 'POST',
    body: { token, password: PASSWORD },
  });
  if (accept.status >= 300) {
    throw new Error(`Accept failed (${accept.status})`);
  }
  return invite.body as Record<string, unknown>;
}

/**
 * Invites a student, accepts the invite, and logs them in.
 *
 * `emailTag` is only used to build a unique test email (e.g. 'AUTH1' ->
 * auth1-<suffix>@test.local) — it is NOT the roll number. The roll number
 * is always server-generated (§2.11), so the real one is read back from the
 * invite response and used for the login call.
 */
export async function addStudent(
  tenant: TenantFixture,
  name: string,
  emailTag: string,
  batchId: string = tenant.batchId,
): Promise<string> {
  const email = `${emailTag.toLowerCase()}-${tenant.suffix}@test.local`;
  const invited = await inviteAndAccept(
    '/invitations/student',
    { name, email, batchId },
    tenant.adminToken,
  );
  const rollNumber = invited.rollNumber as string;

  const res = await api<{ accessToken: string }>('/auth/student/login', {
    method: 'POST',
    body: {
      instituteSlug: tenant.slug,
      rollNumber,
      password: PASSWORD,
    },
  });
  expectStatus(res, 200);
  return res.body.accessToken;
}

/**
 * The real, server-generated roll number (§2.11) for the student owning
 * this token. Tests that need to log in a second time, or cross-reference a
 * results row back to a specific candidate, can't use the label passed to
 * addStudent() for that — it was never sent to the server.
 */
export async function getRollNumber(studentToken: string): Promise<string> {
  const res = await api<{ student: { rollNumber: string } }>(
    '/auth/me/profile',
    { token: studentToken },
  );
  expectStatus(res, 200);
  return res.body.student.rollNumber;
}

/** Authors a question as the teacher and approves it as the admin. */
export async function createApprovedQuestion(
  tenant: TenantFixture,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const created = await api<{ id: string }>('/questions', {
    method: 'POST',
    token: tenant.teacherToken,
    body: {
      subject: 'Physics',
      chapter: 'Mechanics',
      difficulty: 'EASY',
      type: 'MCQ',
      examType: 'NEET',
      statement: 'What is the unit of force?',
      options: [
        { key: 'A', text: 'Newton' },
        { key: 'B', text: 'Joule' },
      ],
      answerKey: 'A',
      ...overrides,
    },
  });
  expectStatus(created, 201);
  const id = created.body.id;

  await api(`/questions/${id}/submit`, {
    method: 'POST',
    token: tenant.teacherToken,
  });
  await api(`/questions/${id}/approve`, {
    method: 'POST',
    token: tenant.adminToken,
  });
  return id;
}

export interface ExamOptions {
  title?: string;
  durationMinutes?: number;
  questionIds: string[];
  batchIds?: string[];
  /** Defaults to a window that is open right now. */
  startAt?: string;
  endAt?: string;
  resultPolicy?: 'IMMEDIATE' | 'ON_PUBLISH' | 'BATCH_WISE';
  maxViolations?: number;
}

/** Builds a fully published exam: section, questions, batch and schedule. */
export async function createPublishedExam(
  tenant: TenantFixture,
  options: ExamOptions,
): Promise<{ examId: string; sectionId: string }> {
  const exam = await api<{ id: string }>('/exams', {
    method: 'POST',
    token: tenant.teacherToken,
    body: {
      title: options.title ?? 'Mock Test',
      durationMinutes: options.durationMinutes ?? 60,
      ...(options.resultPolicy ? { resultPolicy: options.resultPolicy } : {}),
      ...(options.maxViolations !== undefined
        ? { maxViolations: options.maxViolations }
        : {}),
    },
  });
  expectStatus(exam, 201);
  const examId = exam.body.id;

  const section = await api<{ id: string }>(`/exams/${examId}/sections`, {
    method: 'POST',
    token: tenant.teacherToken,
    body: { name: 'Physics' },
  });
  const sectionId = section.body.id;

  for (const questionId of options.questionIds) {
    await api(`/exams/${examId}/sections/${sectionId}/questions`, {
      method: 'POST',
      token: tenant.teacherToken,
      body: { questionId },
    });
  }

  for (const batchId of options.batchIds ?? [tenant.batchId]) {
    await api(`/exams/${examId}/batches`, {
      method: 'POST',
      token: tenant.adminToken,
      body: { batchId },
    });
  }

  // publish() only accepts APPROVED exams (the whole point of the approval
  // step — see exams.controller.ts create()'s own comment). Route through the
  // real lifecycle rather than relying on a shortcut.
  const submitted = await api(`/exams/${examId}/submit`, {
    method: 'POST',
    token: tenant.teacherToken,
    body: { reviewerId: tenant.adminUserId },
  });
  expectStatus(submitted, 200);
  const approved = await api(`/exams/${examId}/approve`, {
    method: 'POST',
    token: tenant.adminToken,
  });
  expectStatus(approved, 200);

  await api(`/exams/${examId}/schedule`, {
    method: 'PATCH',
    token: tenant.adminToken,
    body: {
      startAt: options.startAt ?? new Date(Date.now() - 60_000).toISOString(),
      endAt: options.endAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    },
  });

  const published = await api(`/exams/${examId}/publish`, {
    method: 'POST',
    token: tenant.adminToken,
  });
  expectStatus(published, 201);

  return { examId, sectionId };
}
