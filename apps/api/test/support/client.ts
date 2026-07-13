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

// --- Invitation links (the dev mail adapter prints them to the app log) ---

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

export async function loginSuperadmin(): Promise<string> {
  const res = await api<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: SUPERADMIN,
  });
  if (res.status !== 200) {
    throw new Error(
      `Superadmin login failed (${res.status}). Seed the database first: pnpm --filter @drsk/api db:seed`,
    );
  }
  return res.body.accessToken;
}

export async function loginStaff(
  email: string,
  password: string = PASSWORD,
): Promise<string> {
  const res = await api<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  expectStatus(res, 200);
  return res.body.accessToken;
}

export interface TenantFixture {
  suffix: string;
  slug: string;
  instituteId: string;
  superToken: string;
  adminToken: string;
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
    teacherToken,
    programId: program.body.id,
    classId: klass.body.id,
    batchId: batch.body.id,
  };
}

async function inviteAndAccept(
  path: string,
  body: Record<string, unknown>,
  inviterToken: string,
): Promise<void> {
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
}

/** Invites a student, accepts the invite, and logs them in. */
export async function addStudent(
  tenant: TenantFixture,
  name: string,
  rollNumber: string,
  batchId: string = tenant.batchId,
): Promise<string> {
  const email = `${rollNumber.toLowerCase()}-${tenant.suffix}@test.local`;
  await inviteAndAccept(
    '/invitations/student',
    { name, email, rollNumber, batchId },
    tenant.adminToken,
  );

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
