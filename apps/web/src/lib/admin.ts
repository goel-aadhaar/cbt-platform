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
  instructions: string | null;
  status: string;
  durationMinutes: number;
  passingMarks: number | null;
  resultPolicy: string;
  programId: string | null;
  category: { id: string; name: string } | null;
  startAt: string | null;
  endAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdBy: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  sections: {
    id: string;
    name: string;
    order: number;
    marksCorrect: number;
    marksWrong: number;
    questions: {
      id: string;
      order: number;
      question: {
        id: string;
        subject: string;
        type: string;
        statement: string;
        marks: number;
        difficulty: "EASY" | "MEDIUM" | "HARD";
        topicId: string | null;
        mediaKeys: string[];
      };
    }[];
  }[];
  batches: { id: string; batch: { id: string; name: string } }[];
  _count: { sections: number; questions: number; batches: number };
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
/**
 * Download an authenticated file from the API.
 *
 * `<a href>` cannot carry a bearer token, so the bytes are fetched and handed
 * to the browser as an object URL — the same shape as the results export,
 * factored out so attendance did not need a second copy of it.
 */
async function downloadAuthed(path: string, filename: string): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message;
    throw new Error(
      Array.isArray(msg)
        ? msg.join(", ")
        : (msg ?? `Download failed (${res.status})`),
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface AttendanceRow {
  rollNumber: string;
  name: string;
  batch: string;
  present: boolean;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  answered: number;
  totalQuestions: number;
  violations: number;
  flagged: boolean;
}

export interface AttendanceReport {
  examId: string;
  title: string;
  window: { startAt: string | null; endAt: string | null };
  expected: number;
  present: number;
  absent: number;
  students: AttendanceRow[];
}

/**
 * GET /exams/:id/attendance — who was expected and who turned up.
 *
 * Not the same question as the result sheet: results only contain candidates
 * who have a result, so everyone who never started is missing from it. The
 * absences are the point of an attendance report.
 */
export function getAttendance(examId: string): Promise<AttendanceReport> {
  return apiFetch<AttendanceReport>(`/exams/${examId}/attendance`, auth());
}

/** Download the attendance sheet, absences included. */
export function downloadAttendanceCsv(
  examId: string,
  filename = "attendance.csv",
): Promise<void> {
  return downloadAuthed(`/exams/${examId}/attendance/export/csv`, filename);
}

export interface StudentHistoryEntry {
  id: string;
  totalScore: number;
  maxScore: number;
  overallRank: number | null;
  percentile: number | null;
  published: boolean;
  createdAt: string;
  exam: { id: string; title: string };
}

/**
 * GET /students/:id/history — one candidate's full exam record.
 *
 * Implemented server-side from the start and never called by anything.
 */
export function getStudentHistory(studentId: string): Promise<{
  student: { id: string; rollNumber: string; name: string };
  results: StudentHistoryEntry[];
}> {
  return apiFetch(`/students/${studentId}/history`, auth());
}

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
  /** Minimum total marks to pass, shown on results. Omit for no pass/fail line. */
  passingMarks?: number;
  instructions?: string;
  calculatorEnabled?: boolean;
  fullscreenRequired?: boolean;
  maxViolations?: number;
  programId?: string;
  /** The catalogue entry this paper belongs to (§2.3) — was already sent by
   * every caller via a conditional spread, which TS's excess-property check
   * doesn't see through; declaring it here just makes that honest. */
  categoryId?: string;
  resultPolicy?: "IMMEDIATE" | "ON_PUBLISH" | "BATCH_WISE";
}

/** POST /exams — creates the exam in DRAFT. */
export function createExam(
  body: CreateExamInput,
): Promise<{ id: string; title: string; status: string }> {
  return apiFetch(`/exams`, { method: "POST", body, ...auth() });
}

/**
 * POST /exams/:id/clone — TEACHER only (authoring is the teacher's job, same
 * as create). Copies config, sections and question layout into a fresh
 * DRAFT; batches, schedule and publish state are not carried over.
 */
export function cloneExam(
  examId: string,
  title?: string,
): Promise<{ id: string; title: string; status: string }> {
  return apiFetch(`/exams/${examId}/clone`, {
    method: "POST",
    body: title ? { title } : {},
    ...auth(),
  });
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
/**
 * Amend an exam's own fields (PATCH /exams/:id).
 *
 * The endpoint has existed since exams did; nothing in the app called it, which
 * is why a paper could be authored and then never corrected.
 */
export function updateExam(
  examId: string,
  body: {
    title?: string;
    durationMinutes?: number;
    passingMarks?: number | null;
    instructions?: string;
    programId?: string | null;
    categoryId?: string | null;
    maxViolations?: number;
    calculatorEnabled?: boolean;
    fullscreenRequired?: boolean;
  },
): Promise<ExamDetail> {
  return apiFetch(`/exams/${examId}`, { method: "PATCH", body, ...auth() });
}

/**
 * Amend a section — rename it, or correct its marking scheme.
 *
 * Marks live on the section, not the question, so this is the only way to fix a
 * paper's scoring. Fields are individually optional so renaming and re-marking
 * do not clobber one another.
 */
export function updateSection(
  examId: string,
  sectionId: string,
  body: { name?: string; marksCorrect?: number; marksWrong?: number },
): Promise<{ id: string; name: string; order: number }> {
  return apiFetch(`/exams/${examId}/sections/${sectionId}`, {
    method: "PATCH",
    body,
    ...auth(),
  });
}

/** Drop a section and its placements. The questions return to the bank. */
export function removeSection(
  examId: string,
  sectionId: string,
): Promise<{ removed: string }> {
  return apiFetch(`/exams/${examId}/sections/${sectionId}`, {
    method: "DELETE",
    ...auth(),
  });
}

/** Take one question off the paper. The question itself is untouched. */
export function removeQuestionFromSection(
  examId: string,
  sectionId: string,
  questionId: string,
): Promise<{ removed: string }> {
  return apiFetch(
    `/exams/${examId}/sections/${sectionId}/questions/${questionId}`,
    { method: "DELETE", ...auth() },
  );
}

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

/** DELETE /exams/:id/batches/:batchId — drop an assignment (§ reschedule). */
export function unassignBatch(
  examId: string,
  batchId: string,
): Promise<{ id: string; batchId: string }> {
  return apiFetch(`/exams/${examId}/batches/${batchId}`, {
    method: "DELETE",
    ...auth(),
  });
}

/* ------------------------------------------------------------------ *
 * ORG STRUCTURE — program → class → batch (§2.11)                     *
 * ------------------------------------------------------------------ */

export interface Program {
  id: string;
  name: string;
  isActive: boolean;
}
export interface ClassRow {
  id: string;
  name: string;
  programId: string;
  isActive: boolean;
}
export interface BatchRow {
  id: string;
  name: string;
  classId: string;
  isActive: boolean;
}

/**
 * GET /programs — ADMIN.
 *
 * Archived programs are excluded by default, which is what every picker wants.
 * The organization screen passes `true` so an archived entry stays visible and
 * can be restored.
 */
export function listPrograms(includeArchived = false): Promise<Program[]> {
  const qs = includeArchived ? `?includeArchived=true` : "";
  return apiFetch<Program[]>(`/programs${qs}`, auth());
}

/** POST /programs — ADMIN. Name must be unique within the institute. */
export function createProgram(name: string): Promise<Program> {
  return apiFetch(`/programs`, { method: "POST", body: { name }, ...auth() });
}

/** PATCH /programs/:id — rename. */
export function renameProgram(id: string, name: string): Promise<Program> {
  return apiFetch(`/programs/${id}`, {
    method: "PATCH",
    body: { name },
    ...auth(),
  });
}

/**
 * DELETE /programs/:id — ADMIN. Archives it (isActive: false); this is not a
 * hard delete, so classes already under it keep the reference.
 */
export function archiveProgram(id: string): Promise<Program> {
  return apiFetch(`/programs/${id}`, { method: "DELETE", ...auth() });
}

/** GET /classes — ADMIN, optionally scoped to a program. Archived excluded
 * unless asked for — see {@link listPrograms}. */
export function listClasses(
  programId?: string,
  includeArchived = false,
): Promise<ClassRow[]> {
  const params = new URLSearchParams();
  if (programId) params.set("programId", programId);
  if (includeArchived) params.set("includeArchived", "true");
  const qs = params.size ? `?${params}` : "";
  return apiFetch<ClassRow[]>(`/classes${qs}`, auth());
}

/** POST /classes — ADMIN. Name must be unique within the program. */
export function createClass(
  programId: string,
  name: string,
): Promise<ClassRow> {
  return apiFetch(`/classes`, {
    method: "POST",
    body: { programId, name },
    ...auth(),
  });
}

/** PATCH /classes/:id — rename. */
export function renameClass(id: string, name: string): Promise<ClassRow> {
  return apiFetch(`/classes/${id}`, {
    method: "PATCH",
    body: { name },
    ...auth(),
  });
}

/** DELETE /classes/:id — ADMIN. Archives it; batches keep the reference. */
export function archiveClass(id: string): Promise<ClassRow> {
  return apiFetch(`/classes/${id}`, { method: "DELETE", ...auth() });
}

/** GET /batches — ADMIN, optionally scoped to a class. Archived excluded
 * unless asked for — see {@link listPrograms}. */
export function listBatches(
  classId?: string,
  includeArchived = false,
): Promise<BatchRow[]> {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (includeArchived) params.set("includeArchived", "true");
  const qs = params.size ? `?${params}` : "";
  return apiFetch<BatchRow[]>(`/batches${qs}`, auth());
}

/** POST /batches — ADMIN. Name must be unique within the class. */
export function createBatch(classId: string, name: string): Promise<BatchRow> {
  return apiFetch(`/batches`, {
    method: "POST",
    body: { classId, name },
    ...auth(),
  });
}

/** PATCH /batches/:id — rename. */
export function renameBatch(id: string, name: string): Promise<BatchRow> {
  return apiFetch(`/batches/${id}`, {
    method: "PATCH",
    body: { name },
    ...auth(),
  });
}

/** DELETE /batches/:id — ADMIN. Archives it; enrolled students keep the reference. */
export function archiveBatch(id: string): Promise<BatchRow> {
  return apiFetch(`/batches/${id}`, { method: "DELETE", ...auth() });
}

/* ------------------------------------------------------------------ *
 * QUESTION TAXONOMY — subject → chapter → topic (§2.4)                *
 * ------------------------------------------------------------------ */

export interface Subject {
  id: string;
  name: string;
  isActive: boolean;
}
export interface ChapterRow {
  id: string;
  name: string;
  subjectId: string;
  isActive: boolean;
}
export interface TopicRow {
  id: string;
  name: string;
  chapterId: string;
  isActive: boolean;
}

/** GET /subjects — ADMIN or TEACHER (populates the authoring dropdowns). */
export function listSubjects(): Promise<Subject[]> {
  return apiFetch<Subject[]>(`/subjects`, auth());
}

/** POST /subjects — ADMIN. Name must be unique within the institute. */
export function createSubject(name: string): Promise<Subject> {
  return apiFetch(`/subjects`, { method: "POST", body: { name }, ...auth() });
}

/** PATCH /subjects/:id — rename. */
export function renameSubject(id: string, name: string): Promise<Subject> {
  return apiFetch(`/subjects/${id}`, {
    method: "PATCH",
    body: { name },
    ...auth(),
  });
}

/** DELETE /subjects/:id — ADMIN. Archives it; chapters keep the reference. */
export function archiveSubject(id: string): Promise<Subject> {
  return apiFetch(`/subjects/${id}`, { method: "DELETE", ...auth() });
}

/** GET /chapters — ADMIN or TEACHER, optionally scoped to a subject. */
export function listChapters(subjectId?: string): Promise<ChapterRow[]> {
  const qs = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  return apiFetch<ChapterRow[]>(`/chapters${qs}`, auth());
}

/** POST /chapters — ADMIN. Name must be unique within the subject. */
export function createChapter(
  subjectId: string,
  name: string,
): Promise<ChapterRow> {
  return apiFetch(`/chapters`, {
    method: "POST",
    body: { subjectId, name },
    ...auth(),
  });
}

/** PATCH /chapters/:id — rename. */
export function renameChapter(id: string, name: string): Promise<ChapterRow> {
  return apiFetch(`/chapters/${id}`, {
    method: "PATCH",
    body: { name },
    ...auth(),
  });
}

/** DELETE /chapters/:id — ADMIN. Archives it; topics keep the reference. */
export function archiveChapter(id: string): Promise<ChapterRow> {
  return apiFetch(`/chapters/${id}`, { method: "DELETE", ...auth() });
}

/** GET /topics — ADMIN or TEACHER, optionally scoped to a chapter. */
export function listTopics(chapterId?: string): Promise<TopicRow[]> {
  const qs = chapterId ? `?chapterId=${encodeURIComponent(chapterId)}` : "";
  return apiFetch<TopicRow[]>(`/topics${qs}`, auth());
}

/** POST /topics — ADMIN. Name must be unique within the chapter. */
export function createTopic(
  chapterId: string,
  name: string,
): Promise<TopicRow> {
  return apiFetch(`/topics`, {
    method: "POST",
    body: { chapterId, name },
    ...auth(),
  });
}

/** PATCH /topics/:id — rename. */
export function renameTopic(id: string, name: string): Promise<TopicRow> {
  return apiFetch(`/topics/${id}`, {
    method: "PATCH",
    body: { name },
    ...auth(),
  });
}

/** DELETE /topics/:id — ADMIN. Archives it; questions keep the reference. */
export function archiveTopic(id: string): Promise<TopicRow> {
  return apiFetch(`/topics/${id}`, { method: "DELETE", ...auth() });
}

/* ------------------------------------------------------------------ *
 * INVITATIONS (how staff + students are actually created)             *
 * ------------------------------------------------------------------ */

/**
 * POST /invitations/student — ADMIN. Creates a PENDING student + invite.
 * No rollNumber field: it's always server-generated
 * ({yy}{institute code}{sequence}), returned in the response.
 */
export function inviteStudent(body: {
  name: string;
  email: string;
  batchId: string;
}): Promise<
  { id?: string; email?: string; rollNumber?: string } & Record<string, unknown>
> {
  return apiFetch(`/invitations/student`, { method: "POST", body, ...auth() });
}

/**
 * POST /invitations/teacher — ADMIN. `batchIds` is optional — a teacher can
 * be invited unassigned and given batches later via `setStaffBatches`.
 */
export function inviteTeacher(body: {
  name: string;
  email: string;
  batchIds?: string[];
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
  /** Batches this teacher may see (§ batch-scoped teacher access). Always
   * empty for an ADMIN row — admins are never batch-restricted. */
  batches: { id: string; name: string }[];
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
    /** Restrict to teachers assigned to this batch. Meaningless for ADMIN. */
    batchId?: string;
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
  if (q.batchId) params.set("batchId", q.batchId);
  params.set("limit", String(q.limit ?? 200));
  return apiFetch(`/staff?${params}`, auth());
}

/** GET /staff/:id — ADMIN. */
export function fetchStaff(id: string): Promise<StaffRow> {
  return apiFetch(`/staff/${id}`, auth());
}

/** PATCH /staff/:id — ADMIN. */
export function updateStaff(
  id: string,
  body: {
    name?: string;
    /**
     * Replaces the account's roles outright — pass every role it should end up
     * with, not just the new one.
     *
     * Only TEACHER and ADMIN are assignable: SUPERADMIN is platform-level and
     * granted out of band, and STUDENT is not staff. The API refuses a
     * self-demotion or the removal of the last administrator, and a session
     * whose active role is taken away stops working on its very next request.
     */
    roles?: ("TEACHER" | "ADMIN")[];
  },
): Promise<StaffRow> {
  return apiFetch(`/staff/${id}`, { method: "PATCH", body, ...auth() });
}

/** DELETE /staff/:id — ADMIN. Archives the account (sets it DISABLED). */
export function deactivateStaff(id: string): Promise<StaffRow> {
  return apiFetch(`/staff/${id}`, { method: "DELETE", ...auth() });
}

/** POST /staff/:id/reactivate — ADMIN. Undoes a deactivation. */
export function reactivateStaff(id: string): Promise<StaffRow> {
  return apiFetch(`/staff/${id}/reactivate`, { method: "POST", ...auth() });
}

/** POST /staff/:id/resend-invite — ADMIN. Re-sends a still-pending invite. */
export function resendStaffInvite(id: string): Promise<StaffRow> {
  return apiFetch(`/staff/${id}/resend-invite`, {
    method: "POST",
    ...auth(),
  });
}

/** GET /staff/:id/batches — ADMIN. One teacher's current assignment. */
export function getStaffBatches(
  id: string,
): Promise<{ id: string; name: string }[]> {
  return apiFetch(`/staff/${id}/batches`, auth());
}

/**
 * PUT /staff/:id/batches — ADMIN. Full-replace: `batchIds` becomes the
 * teacher's complete assignment.
 */
export function setStaffBatches(
  id: string,
  batchIds: string[],
): Promise<{ id: string; name: string }[]> {
  return apiFetch(`/staff/${id}/batches`, {
    method: "PUT",
    body: { batchIds },
    ...auth(),
  });
}

/** GET /staff/me/batches — TEACHER. The caller's own assignment. */
export function getMyBatches(): Promise<{ id: string; name: string }[]> {
  return apiFetch(`/staff/me/batches`, auth());
}

/* ------------------------------------------------------------------ *
 * CSV IMPORT                                                          *
 * ------------------------------------------------------------------ */

export interface ImportSummary {
  batchId: string;
  batch: string;
  total: number;
  imported: { row: number; name: string; email: string; rollNumber: string }[];
  failed: { row: number; email: string; reason: string }[];
}

/** GET /students/import/template — the workbook to fill in. */
export function downloadStudentTemplate(): Promise<void> {
  return downloadAuthed(
    "/students/import/template",
    "codonmind-students-template.xlsx",
  );
}

/**
 * POST /students/import — multipart upload of an Excel workbook or a CSV.
 *
 * Sent with fetch directly (not apiFetch) because the body is FormData: setting
 * Content-Type manually would strip the multipart boundary. Roll numbers are
 * always server-generated — a rollNumber column in the file, if present, is
 * ignored.
 */
export async function importStudentRoster(
  file: File,
  opts: { batchId: string },
): Promise<ImportSummary> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const qs = new URLSearchParams({ batchId: opts.batchId });

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

/**
 * Manual evaluation (§2.5).
 *
 * A question set to MANUAL is taken out of auto-scoring, so every candidate
 * scores zero on it until marks are awarded by hand. These two calls are how
 * that gets done: read the roster with each candidate's actual answer, then
 * write the awards back in one request.
 */

export interface ManualRosterItem {
  attemptId: string;
  student: { name: string; rollNumber: string; batch: string | null };
  /** Whatever the candidate submitted — an option key, a list, or a number. */
  answer: unknown;
  status: string;
  /** Null means "not graded yet", which is not the same as graded zero. */
  awarded: number | null;
}

export interface ManualRoster {
  questionId: string;
  scoring: QuestionScoring;
  statement: string;
  type: string;
  answerKey: unknown;
  section: string | null;
  maxMarks: number;
  items: ManualRosterItem[];
}

/** GET /exams/:id/questions/:questionId/manual — the grading list. */
export function getManualRoster(
  examId: string,
  questionId: string,
): Promise<ManualRoster> {
  return apiFetch(`/exams/${examId}/questions/${questionId}/manual`, {
    token: getToken() ?? undefined,
  });
}

/**
 * PUT /exams/:id/results/manual/bulk — award marks to many candidates at once.
 *
 * Bulk deliberately: the per-candidate route re-evaluates the whole exam on
 * every call, so grading a cohort one request at a time would re-rank everyone
 * once per candidate.
 */
export function setManualScores(
  examId: string,
  questionId: string,
  awards: { attemptId: string; marks: number }[],
): Promise<{
  questionId: string;
  graded: number;
  recalculated: { evaluated: number; maxScore: number };
}> {
  return apiFetch(`/exams/${examId}/results/manual/bulk`, {
    method: "PUT",
    body: { questionId, awards },
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
