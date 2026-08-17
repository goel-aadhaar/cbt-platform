/**
 * Admin-side API client — results, live monitoring, and the write actions the
 * console's buttons fire. Every endpoint here is ADMIN-gated by the backend
 * (`@Roles(Role.ADMIN)`), except question mutations which also allow TEACHER
 * for create/update but require ADMIN for approve/reject/archive.
 */

import { apiFetch } from "./api";
import { getToken } from "./auth";

const auth = () => ({ token: getToken() ?? undefined });

/* ------------------------------------------------------------------ *
 * RESULTS                                                             *
 * ------------------------------------------------------------------ */

export interface ExamResultRow {
  id: string;
  totalScore: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  overallRank: number | null;
  batchRank: number | null;
  percentile: number | null;
  published: boolean;
  student: { rollNumber: string; user: { name: string } };
  attempt: { flagged: boolean; violationCount: number };
}

/** GET /exams/:id/results — ranked rows for one exam. */
export function listExamResults(examId: string): Promise<ExamResultRow[]> {
  return apiFetch<ExamResultRow[]>(`/exams/${examId}/results`, auth());
}

export interface ExamDetail {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  startAt: string | null;
  endAt: string | null;
  sections: { id: string; name: string; questions: unknown[] }[];
  batches: { id: string; batch: { id: string; name: string } }[];
}

/** GET /exams/:id — includes sections and assigned batches. */
export function fetchExam(examId: string): Promise<ExamDetail> {
  return apiFetch<ExamDetail>(`/exams/${examId}`, auth());
}

/** POST /exams/:id/evaluate — score every submitted attempt. */
export function evaluateExam(
  examId: string,
): Promise<{ evaluated: number; maxScore: number; autoPublished: boolean }> {
  return apiFetch(`/exams/${examId}/evaluate`, { method: "POST", ...auth() });
}

/** POST /exams/:id/results/publish — release results (optionally per batch). */
export function publishResults(
  examId: string,
  batchId?: string,
): Promise<{ published: number; batchId?: string }> {
  const qs = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
  return apiFetch(`/exams/${examId}/results/publish${qs}`, {
    method: "POST",
    ...auth(),
  });
}

/** POST /exams/:id/results/hold — pull results back from students. */
export function holdResults(
  examId: string,
  batchId?: string,
): Promise<{ held: number; batchId?: string }> {
  const qs = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
  return apiFetch(`/exams/${examId}/results/hold${qs}`, {
    method: "POST",
    ...auth(),
  });
}

/**
 * GET /exams/:id/results/export/{csv|xlsx|pdf} — streams a file.
 *
 * Uses fetch + a blob URL rather than a plain link because the endpoint needs
 * an Authorization header, which an <a download> cannot carry.
 */
export async function downloadResultsExport(
  examId: string,
  format: "csv" | "xlsx" | "pdf",
  filename?: string,
): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const res = await fetch(`${base}/exams/${examId}/results/export/${format}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message;
    throw new Error(
      Array.isArray(msg)
        ? msg.join(", ")
        : (msg ?? `Export failed (${res.status})`),
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `results.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ *
 * ANALYTICS                                                           *
 * ------------------------------------------------------------------ */

export interface ExamAnalytics {
  examId: string;
  title: string;
  attempts: number;
  maxScore: number;
  score: { average: number; median: number; highest: number; lowest: number };
  percentileAverage: number;
  distribution: { range: string; count: number }[];
  sections: {
    sectionId: string;
    name: string;
    averageScore: number;
    averageCorrect: number;
    averageIncorrect: number;
  }[];
  questions: {
    questionId: string;
    statement: string;
    type: string;
    correct: number;
    incorrect: number;
    unattempted: number;
    correctPct: number;
  }[];
}

/** GET /exams/:id/analytics — aggregate stats for one exam. */
export function fetchExamAnalytics(examId: string): Promise<ExamAnalytics> {
  return apiFetch<ExamAnalytics>(`/exams/${examId}/analytics`, auth());
}

/* ------------------------------------------------------------------ *
 * LIVE MONITORING                                                     *
 * ------------------------------------------------------------------ */

export type MonitorStudentStatus =
  "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";

export interface MonitorStudent {
  studentId: string;
  rollNumber: string;
  name: string;
  /** Verified against the live API: this is an object, not a bare name. */
  batch: { id: string; name: string } | null;
  totalQuestions: number;
  status: MonitorStudentStatus;
  startedAt: string | null;
  submittedAt: string | null;
  remainingSeconds: number | null;
  timeUp: boolean;
  answered: number;
  violations: number;
  flagged: boolean;
  lastActivityAt: string | null;
}

export interface ExamMonitor {
  examId: string;
  title: string;
  examStatus: string;
  window: { startAt: string | null; endAt: string | null };
  totalStudents: number;
  totalQuestions: number;
  counts: {
    notStarted: number;
    inProgress: number;
    submitted: number;
    autoSubmitted: number;
  };
  serverTime: string;
  students: MonitorStudent[];
}

/** GET /exams/:id/monitor — live per-student progress for one exam. */
export function fetchExamMonitor(
  examId: string,
  opts: { batchId?: string; status?: MonitorStudentStatus } = {},
): Promise<ExamMonitor> {
  const qs = new URLSearchParams();
  if (opts.batchId) qs.set("batchId", opts.batchId);
  if (opts.status) qs.set("status", opts.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<ExamMonitor>(`/exams/${examId}/monitor${suffix}`, auth());
}

/* ------------------------------------------------------------------ *
 * QUESTION REVIEW (ADMIN-only transitions)                            *
 * ------------------------------------------------------------------ */

/**
 * Question lifecycle transitions (§2.5). "submit" is the author's move —
 * the rest are an administrator's.
 */
export type QuestionAction = "submit" | "approve" | "reject" | "archive";

/**
 * POST /questions/:id/{approve|reject|archive}
 *
 * Archiving a question already used in an exam 409s with the affected exam
 * titles unless `confirm: true` — same in-use safeguard as editing a
 * question (§2.5). `submit`/`approve`/`reject` never take a body.
 */
export function actOnQuestion(
  questionId: string,
  action: QuestionAction,
  confirm?: boolean,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/questions/${questionId}/${action}`, {
    method: "POST",
    body: action === "archive" ? { confirm } : undefined,
    ...auth(),
  });
}

/* ------------------------------------------------------------------ *
 * PRACTICE LIBRARY CURATION (§2.4) — TEACHER or ADMIN, no approval     *
 * ------------------------------------------------------------------ */

/** POST /questions/:id/practice — add an APPROVED question to the library. */
export function addToPracticeLibrary(
  questionId: string,
): Promise<{ id: string; inPracticeLibrary: boolean }> {
  return apiFetch(`/questions/${questionId}/practice`, {
    method: "POST",
    ...auth(),
  });
}

/** DELETE /questions/:id/practice — remove it (stays in the bank). */
export function removeFromPracticeLibrary(
  questionId: string,
): Promise<{ id: string; inPracticeLibrary: boolean }> {
  return apiFetch(`/questions/${questionId}/practice`, {
    method: "DELETE",
    ...auth(),
  });
}

/* ------------------------------------------------------------------ *
 * EXAM LIFECYCLE                                                      *
 * ------------------------------------------------------------------ */

/** POST /exams/:id/publish — make an exam visible to assigned batches. */
export function publishExam(
  examId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/exams/${examId}/publish`, { method: "POST", ...auth() });
}

/** POST /exams/:id/unpublish */
export function unpublishExam(
  examId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/exams/${examId}/unpublish`, { method: "POST", ...auth() });
}

/* ------------------------------------------------------------------ *
 * APPROVAL WORKFLOW (§2.3)                                            *
 * DRAFT → REVIEW → APPROVED → PUBLISHED(live)                         *
 * ------------------------------------------------------------------ */

/** POST /exams/:id/submit — author hands the paper to a named admin. */
export function submitExamForReview(
  examId: string,
  reviewerId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/exams/${examId}/submit`, {
    method: "POST",
    body: { reviewerId },
    ...auth(),
  });
}

/** POST /exams/:id/approve — ADMIN. Moves it into the qualified pool. */
export function approveExam(
  examId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/exams/${examId}/approve`, { method: "POST", ...auth() });
}

/** POST /exams/:id/reject — ADMIN. Sends it back to the author. */
export function rejectExam(
  examId: string,
  reason?: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/exams/${examId}/reject`, {
    method: "POST",
    body: reason ? { reason } : {},
    ...auth(),
  });
}

/** POST /exams/:id/start — ADMIN. Opens the window now and goes live. */
export function startExamNow(
  examId: string,
): Promise<{ id: string; status: string; startAt: string; endAt: string }> {
  return apiFetch(`/exams/${examId}/start`, { method: "POST", ...auth() });
}

/** Admins of this institute — the reviewer picker for exam submission. */
export function listAdmins(): Promise<StaffRow[]> {
  return listStaff({ role: "ADMIN", status: "ACTIVE", limit: 200 }).then(
    (r) => r.items,
  );
}

/** PATCH /exams/:id/schedule — set the open/close window (ISO-8601 strings). */
export function scheduleExam(
  examId: string,
  body: { startAt: string; endAt: string },
): Promise<{ id: string; startAt: string; endAt: string }> {
  return apiFetch(`/exams/${examId}/schedule`, {
    method: "PATCH",
    body,
    ...auth(),
  });
}

/* ------------------------------------------------------------------ *
 * EXAM AUTHORING                                                      *
 * ------------------------------------------------------------------ */

export interface CreateExamInput {
  title: string;
  durationMinutes: number;
  instructions?: string;
  calculatorEnabled?: boolean;
  fullscreenRequired?: boolean;
  maxViolations?: number;
  programId?: string;
  resultPolicy?: "IMMEDIATE" | "ON_PUBLISH" | "BATCH_WISE";
}

/** POST /exams — creates the exam in DRAFT. */
export function createExam(
  body: CreateExamInput,
): Promise<{ id: string; title: string; status: string }> {
  return apiFetch(`/exams`, { method: "POST", body, ...auth() });
}

/** POST /exams/:id/sections */
export function addSection(
  examId: string,
  body: { name: string; marksCorrect?: number; marksWrong?: number },
): Promise<{ id: string; name: string; order: number }> {
  return apiFetch(`/exams/${examId}/sections`, {
    method: "POST",
    body,
    ...auth(),
  });
}

/** POST /exams/:id/sections/:sectionId/questions — APPROVED questions only. */
export function addQuestionToSection(
  examId: string,
  sectionId: string,
  questionId: string,
): Promise<{ id: string; order: number }> {
  return apiFetch(`/exams/${examId}/sections/${sectionId}/questions`, {
    method: "POST",
    body: { questionId },
    ...auth(),
  });
}

/** POST /exams/:id/batches — assign a batch so its students may sit the exam. */
export function assignBatch(
  examId: string,
  batchId: string,
): Promise<{ id: string }> {
  return apiFetch(`/exams/${examId}/batches`, {
    method: "POST",
    body: { batchId },
    ...auth(),
  });
}

/* ------------------------------------------------------------------ *
 * ORG STRUCTURE (pickers)                                             *
 * ------------------------------------------------------------------ */

export interface Program {
  id: string;
  name: string;
}
export interface ClassRow {
  id: string;
  name: string;
  programId: string;
}
export interface BatchRow {
  id: string;
  name: string;
  classId: string;
}

/** GET /programs — ADMIN. */
export function listPrograms(): Promise<Program[]> {
  return apiFetch<Program[]>(`/programs`, auth());
}

/** GET /classes — ADMIN, optionally scoped to a program. */
export function listClasses(programId?: string): Promise<ClassRow[]> {
  const qs = programId ? `?programId=${encodeURIComponent(programId)}` : "";
  return apiFetch<ClassRow[]>(`/classes${qs}`, auth());
}

/** GET /batches — ADMIN, optionally scoped to a class. */
export function listBatches(classId?: string): Promise<BatchRow[]> {
  const qs = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  return apiFetch<BatchRow[]>(`/batches${qs}`, auth());
}

/* ------------------------------------------------------------------ *
 * INVITATIONS (how staff + students are actually created)             *
 * ------------------------------------------------------------------ */

/** POST /invitations/student — ADMIN. Creates a PENDING student + invite. */
export function inviteStudent(body: {
  name: string;
  email: string;
  rollNumber: string;
  batchId: string;
}): Promise<{ id?: string; email?: string } & Record<string, unknown>> {
  return apiFetch(`/invitations/student`, { method: "POST", body, ...auth() });
}

/** POST /invitations/teacher — ADMIN. */
export function inviteTeacher(body: {
  name: string;
  email: string;
}): Promise<{ id?: string; email?: string } & Record<string, unknown>> {
  return apiFetch(`/invitations/teacher`, { method: "POST", body, ...auth() });
}

/**
 * POST /invitations/admin — ADMIN. Invites a fellow administrator into the
 * caller's own institute; the caller cannot name a different one (the
 * backend derives it from the session regardless of what's sent here).
 */
export function inviteAdmin(body: {
  name: string;
  email: string;
}): Promise<{ id?: string; email?: string } & Record<string, unknown>> {
  return apiFetch(`/invitations/admin`, { method: "POST", body, ...auth() });
}

/* ------------------------------------------------------------------ *
 * STAFF ROSTER                                                        *
 * ------------------------------------------------------------------ */

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  roles: ("ADMIN" | "TEACHER")[];
  status: "PENDING" | "ACTIVE" | "DISABLED";
  joinedAt: string;
  /** Derived from the subjects this teacher authors questions in. */
  subjects: string[];
  questionsAuthored: number;
  examsAuthored: number;
  lastLoginAt: string | null;
}

/** GET /staff — ADMIN. Teaching-staff roster (envelope-shaped). */
export function listStaff(
  q: {
    role?: "ADMIN" | "TEACHER";
    status?: StaffRow["status"];
    search?: string;
    limit?: number;
  } = {},
): Promise<{
  items: StaffRow[];
  total: number;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams();
  if (q.role) params.set("role", q.role);
  if (q.status) params.set("status", q.status);
  if (q.search) params.set("search", q.search);
  params.set("limit", String(q.limit ?? 200));
  return apiFetch(`/staff?${params}`, auth());
}

/* ------------------------------------------------------------------ *
 * CSV IMPORT                                                          *
 * ------------------------------------------------------------------ */

export interface ImportSummary {
  batchId: string;
  batch: string;
  rollPrefix: string | null;
  total: number;
  imported: { row: number; name: string; email: string; rollNumber: string }[];
  failed: { row: number; email: string; reason: string }[];
}

/**
 * POST /students/import — multipart upload. Sent with fetch directly (not
 * apiFetch) because the body is FormData: setting Content-Type manually would
 * strip the multipart boundary.
 */
export async function importStudentsCsv(
  file: File,
  opts: { batchId: string; rollPrefix?: string },
): Promise<ImportSummary> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const qs = new URLSearchParams({ batchId: opts.batchId });
  if (opts.rollPrefix) qs.set("rollPrefix", opts.rollPrefix);

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${base}/students/import?${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    body: form,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload?.message;
    throw new Error(
      Array.isArray(msg)
        ? msg.join(", ")
        : (msg ?? `Import failed (${res.status})`),
    );
  }
  return payload as ImportSummary;
}

/* ------------------------------------------------------------------ *
 * Answer-key corrections (§2.9 bonus marks)                           *
 * ------------------------------------------------------------------ */

export type QuestionScoring = "NORMAL" | "BONUS" | "DROPPED" | "MANUAL";

export interface ExamQuestionScoringRow {
  questionId: string;
  order: number;
  section: string | null;
  statement: string;
  type: string;
  marks: number;
  scoring: QuestionScoring;
  attempted: number;
  correct: number;
  /** Share of candidates who answered it that got it right, 0-100. */
  hitRate: number | null;
}

/** GET /exams/:id/questions/scoring — the answer-key decision per question. */
export function listQuestionScoring(
  examId: string,
): Promise<{ candidates: number; items: ExamQuestionScoringRow[] }> {
  return apiFetch(`/exams/${examId}/questions/scoring`, {
    token: getToken() ?? undefined,
  });
}

/**
 * PATCH /exams/:id/questions/:questionId/scoring — mark a question BONUS,
 * DROPPED, MANUAL or back to NORMAL. The server recalculates scores, ranks and
 * percentiles itself and leaves publication state untouched.
 */
export function setQuestionScoring(
  examId: string,
  questionId: string,
  override: QuestionScoring,
): Promise<{
  examId: string;
  questionId: string;
  scoring: QuestionScoring;
  recalculated: { evaluated: number; maxScore: number } | null;
}> {
  return apiFetch(`/exams/${examId}/questions/${questionId}/scoring`, {
    method: "PATCH",
    body: { override },
    token: getToken() ?? undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Result exports (§2.14)                                              *
 * ------------------------------------------------------------------ */

export type ExportFormat = "csv" | "xlsx" | "pdf";

/**
 * Download a ranked result sheet.
 *
 * The endpoints are authenticated, so a plain anchor href cannot fetch them —
 * the bearer token has to go on the request. We pull the bytes, honour the
 * server's Content-Disposition filename, and hand the browser an object URL.
 */
export async function downloadResultExport(
  examId: string,
  format: ExportFormat,
): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const token = getToken();
  const res = await fetch(`${base}/exams/${examId}/results/export/${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    // Error bodies are JSON even though the success path is a file.
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const m = body.message;
      if (Array.isArray(m)) message = m.join(". ");
      else if (typeof m === "string" && m.trim()) message = m;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? `results.${format}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has definitely started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
