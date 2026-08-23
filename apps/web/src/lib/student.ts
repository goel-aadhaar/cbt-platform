/**
 * Student-facing API client. Mirrors the backend contracts surfaced by
 * `apps/api/src/modules/attempts`, `apps/api/src/modules/results` and
 * `apps/api/src/modules/analytics`. STUDENT-role tokens are the only ones that
 * can call these (the backend rejects STUDENT calls against /exams, /questions
 * and /students — those are TEACHER/ADMIN only).
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

/* ------------------------------------------------------------------ *
 * ME                                                                 *
 * ------------------------------------------------------------------ */

export type StudentProfile = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  instituteId: string | null;
};

/** GET /auth/me — the only student-readable profile endpoint. */
export async function fetchStudentMe(): Promise<StudentProfile> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<StudentProfile>("/auth/me", { token });
}

/* ------------------------------------------------------------------ *
 * EXAM TAKING — attempts                                              *
 * ------------------------------------------------------------------ */

export type QuestionType = "MCQ" | "MSQ" | "INTEGER";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface AttemptQuestion {
  id: string;
  order: number;
  question: {
    id: string;
    type: QuestionType;
    statement: string;
    options?: { key: string; text: string }[];
    marks: number;
    /** Diagrams attached to the question (§2.7), already resolved to URLs. */
    media?: { key: string; url: string }[];
  };
}

export interface AttemptSection {
  id: string;
  name: string;
  order: number;
  marksCorrect: number;
  marksWrong: number;
  questions: AttemptQuestion[];
}

export interface AttemptExam {
  id: string;
  title: string;
  durationMinutes: number;
  instructions: string | null;
  calculatorEnabled: boolean;
  fullscreenRequired: boolean;
  maxViolations: number;
  sections: AttemptSection[];
}

export interface AttemptResponse {
  questionId: string;
  status:
    "NOT_VISITED" | "NOT_ANSWERED" | "ANSWERED" | "MARKED" | "ANSWERED_MARKED";
  answer: string | number | string[] | null;
}

export interface AttemptState {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  violationCount: number;
  flagged: boolean;
  exam: AttemptExam;
  responses: AttemptResponse[];
  remainingSeconds: number;
}

/** POST /attempts — starts an attempt for the given exam. */
export async function startAttempt(examId: string): Promise<AttemptState> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptState>("/attempts", {
    method: "POST",
    body: { examId },
    token,
  });
}

export interface AvailableExam {
  id: string;
  title: string;
  /** Set by the teacher who authored the paper — shown on the pre-exam
   * instructions screen (rendered as HTML, sanitized server-side). */
  instructions: string | null;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  /**
   * The student's existing attempt at this exam, if any.
   * `null` ⇒ never started; `{status: 'IN_PROGRESS'}` ⇒ resume; otherwise
   *  they already submitted/are auto-submitted.
   */
  attempt: {
    id: string;
    status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  } | null;
}

/**
 * GET /attempts/available — exams the current student can sit right now.
 * Backs the student portal's "Start" CTAs (no /exams endpoint is exposed to
 * STUDENT tokens, so the portal gets its own discoverable list).
 */
export async function fetchAvailableExams(): Promise<AvailableExam[]> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  const res = await apiFetch<{ items: AvailableExam[] }>(
    "/attempts/available",
    { token },
  );
  return res.items;
}

/** An exam scheduled for this student that hasn't opened yet. */
export interface UpcomingExam {
  id: string;
  title: string;
  durationMinutes: number;
  startAt: string;
  endAt: string;
}

/** Both halves of GET /attempts/available: sittable now, and scheduled next. */
export async function fetchExamSchedule(): Promise<{
  items: AvailableExam[];
  upcoming: UpcomingExam[];
}> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  const res = await apiFetch<{
    items: AvailableExam[];
    upcoming?: UpcomingExam[];
  }>("/attempts/available", { token });
  return { items: res.items ?? [], upcoming: res.upcoming ?? [] };
}

/** GET /attempts/:id — re-fetch the canonical state (auto-submits if expired). */
export async function getAttempt(attemptId: string): Promise<AttemptState> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptState>(`/attempts/${attemptId}`, { token });
}

/** PUT /attempts/:id/responses/:questionId — auto-save answer / mark for review. */
export async function saveResponse(
  attemptId: string,
  questionId: string,
  body: {
    answer?: string | number | string[] | null;
    markedForReview?: boolean;
    /** Milliseconds on this question SINCE THE LAST REPORT — a delta, summed
     * server-side, so racing autosaves add up instead of overwriting. */
    timeSpentMs?: number;
  },
): Promise<AttemptResponse> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptResponse>(
    `/attempts/${attemptId}/responses/${questionId}`,
    { method: "PUT", body, token },
  );
}

/**
 * PUT /attempts/:id/section-time — accumulate seconds spent in one section.
 *
 * A delta since the last report, like `saveResponse`'s `timeSpentMs`. The
 * endpoint has existed since section timing was added but nothing ever called
 * it, so every stored section time was 0 until this was wired up.
 */
export async function reportSectionTime(
  attemptId: string,
  sectionId: string,
  seconds: number,
): Promise<void> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  await apiFetch(`/attempts/${attemptId}/section-time`, {
    method: "PUT",
    body: { sectionId, seconds },
    token,
  });
}

/**
 * POST /attempts/:id/abandon — leave without submitting.
 *
 * The server discards the saved responses (only a submitted attempt counts)
 * but keeps the attempt in a terminal state, so the exam cannot be entered
 * again. Takes no body.
 */
export async function abandonAttempt(
  attemptId: string,
): Promise<{ attemptId: string; status: string }> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch(`/attempts/${attemptId}/abandon`, { method: "POST", token });
}

/** POST /attempts/:id/submit — final submit. Takes no body. */
export async function submitAttempt(
  attemptId: string,
): Promise<AttemptSummary> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptSummary>(`/attempts/${attemptId}/submit`, {
    method: "POST",
    token,
  });
}

export interface AttemptSummary {
  attemptId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  submittedAt: string | null;
  total: number;
  answered: number;
  markedForReview: number;
  notAnswered: number;
  notVisited: number;
}

/** POST /attempts/:id/violations — report a client-side proctoring infraction. */
export async function reportViolation(
  attemptId: string,
  body: {
    type:
      | "TAB_SWITCH"
      | "FULLSCREEN_EXIT"
      | "FOCUS_LOSS"
      | "COPY"
      | "PASTE"
      | "OTHER";
    detail?: string;
  },
): Promise<{
  violationCount: number;
  maxViolations: number;
  warningsLeft: number;
  autoSubmitted: boolean;
  flagged: boolean;
}> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch(`/attempts/${attemptId}/violations`, {
    method: "POST",
    body,
    token,
  });
}

/* ------------------------------------------------------------------ *
 * RESULTS — published only                                             *
 * ------------------------------------------------------------------ */

/**
 * One section's line in a result. `maxScore`/`questionCount`/`seconds` are
 * optional because results evaluated before those were recorded simply omit
 * them — a reader must degrade to "not recorded", never to a fabricated 0.
 */
export interface SectionScore {
  sectionId: string;
  name: string;
  score: number;
  maxScore?: number;
  questionCount?: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  seconds?: number;
}

export interface AttemptResult {
  attemptId: string;
  totalScore: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  /** An ARRAY — an earlier declaration here claimed a Record and was wrong. */
  sectionScores: SectionScore[] | null;
  overallRank: number | null;
  batchRank: number | null;
  percentile: number | null;
  /** How many candidates sat the paper, so a rank reads "12 of 240". */
  cohortSize: number;
  /** When the result actually became visible. Null for rows released before
   * the timestamp was tracked. */
  publishedAt: string | null;
  exam: {
    id: string;
    title: string;
    passingMarks: number | null;
    durationMinutes: number;
  };
  attempt: {
    startedAt: string;
    submittedAt: string | null;
    status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | "ABANDONED";
  };
}

/** GET /attempts/:id/result — only available once the row is `published`. */
export async function fetchAttemptResult(
  attemptId: string,
): Promise<AttemptResult> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptResult>(`/attempts/${attemptId}/result`, { token });
}

/**
 * Cohort aggregates for the paper — "your score vs the class average".
 *
 * `available: false` when the cohort is too small for an average to still be
 * an aggregate; the page must hide the comparison rather than invent one.
 */
export type AttemptCohort =
  | { available: false; cohortSize: number; batchSize: number }
  | {
      available: true;
      cohortSize: number;
      batchSize: number;
      average: number;
      median: number;
      highest: number;
      lowest: number;
      batchAverage: number | null;
      sections: { sectionId: string; name: string; averageScore: number }[];
    };

/** GET /attempts/:id/cohort — aggregates only, published results only. */
export async function fetchAttemptCohort(
  attemptId: string,
): Promise<AttemptCohort> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptCohort>(`/attempts/${attemptId}/cohort`, { token });
}

/* ------------------------------------------------------------------ *
 * LEADERBOARD — the one student payload that names other candidates   *
 * ------------------------------------------------------------------ */

/**
 * Peers arrive already abbreviated ("Priya S.") and without roll numbers; the
 * caller's own row carries their full name and `you: true`. That shaping is the
 * server's job, not this client's — there is nothing here to re-anonymise, and
 * nothing that could accidentally render more than the server chose to send.
 */
export interface LeaderboardEntry {
  rank: number | null;
  you: boolean;
  name: string;
  initials: string;
  totalScore: number;
  maxScore: number;
  percentile: number | null;
  batch: string | null;
  sections: SectionScore[];
}

export interface SubjectTopper {
  sectionId: string;
  subject: string;
  student: string;
  initials: string;
  score: number;
  maxScore: number | null;
}

export type LeaderboardScope = "overall" | "batch";

/** Withheld when the cohort is too small for a ranking to be an aggregate. */
export interface LeaderboardUnavailable {
  available: false;
  cohortSize: number;
  minimum: number;
  scope: "OVERALL" | "BATCH";
  exam: { id: string; title: string };
}

export interface LeaderboardAvailable {
  available: true;
  cohortSize: number;
  scope: "OVERALL" | "BATCH";
  /**
   * Which cohort `percentile` counts — batch-scoped boards recompute it from
   * the batch's own scores, so a rank and a percentile in the same row always
   * describe the same set of candidates.
   */
  percentileBasis: "OVERALL" | "BATCH";
  exam: { id: string; title: string };
  champion: LeaderboardEntry | null;
  podium: LeaderboardEntry[];
  subjectToppers: SubjectTopper[];
  rows: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  truncated: boolean;
}

export type Leaderboard = LeaderboardAvailable | LeaderboardUnavailable;

/** GET /attempts/:id/leaderboard — published results only. */
export async function fetchAttemptLeaderboard(
  attemptId: string,
  scope: LeaderboardScope = "overall",
  limit = 10,
): Promise<Leaderboard> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<Leaderboard>(
    `/attempts/${attemptId}/leaderboard?scope=${scope}&limit=${limit}`,
    { token },
  );
}

export interface HistoryItem {
  totalScore: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  overallRank: number | null;
  batchRank: number | null;
  percentile: number | null;
  published: boolean;
  createdAt: string;
  exam: { id: string; title: string; startAt: string | null };
}

/** GET /me/history — published exam history for the current student. */
export async function fetchMyHistory(): Promise<HistoryItem[]> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<HistoryItem[]>(`/me/history`, { token });
}

/**
 * One attempt in the student's own record, with the state of its result.
 * `result` is populated ONLY once published — a PENDING row carries no score.
 */
export interface MyAttempt {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  startedAt: string;
  submittedAt: string | null;
  resultState: "IN_PROGRESS" | "PENDING" | "PUBLISHED";
  exam: {
    id: string;
    title: string;
    startAt: string | null;
    durationMinutes: number;
  };
  result: {
    published: boolean;
    totalScore: number;
    maxScore: number;
    correctCount: number;
    incorrectCount: number;
    unattemptedCount: number;
    overallRank: number | null;
    batchRank: number | null;
    percentile: number | null;
  } | null;
}

/**
 * GET /me/attempts — every attempt, including those awaiting publication.
 * `/me/history` only returns PUBLISHED results, so this is what lets the
 * portal show the "results pending" state between submit and publish.
 */
export async function fetchMyAttempts(): Promise<MyAttempt[]> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<MyAttempt[]>(`/me/attempts`, { token });
}

/* ------------------------------------------------------------------ *
 * PER-QUESTION REVIEW — published results only                        *
 * ------------------------------------------------------------------ */

export type ReviewStatus =
  "CORRECT" | "INCORRECT" | "UNATTEMPTED" | "DROPPED" | "BONUS";

export interface ReviewQuestion {
  number: number;
  questionId: string;
  sectionId: string;
  section: string;
  type: QuestionType;
  statement: string;
  options: { key: string; text: string }[] | null;
  yourAnswer: string | number | string[] | null;
  correctAnswer: string | number | string[];
  explanation: string | null;
  status: ReviewStatus;
  marksAwarded: number;
  marksCorrect: number;
  marksWrong: number;
  subject: string;
  chapter: string;
  topic: string | null;
  difficulty: Difficulty;
  /** Storage keys for attached diagrams — resolve via `/media/file/:key`. */
  mediaKeys: string[];
  /** Flagged during the exam with "Mark for Review". */
  markedForReview: boolean;
  /** Opened at all, as opposed to never navigated to. */
  visited: boolean;
  /** Null for attempts sat before per-question timing was instrumented. */
  timeSpentMs: number | null;
}

export interface AttemptReview {
  attemptId: string;
  exam: {
    title: string;
    durationMinutes: number;
    passingMarks: number | null;
  };
  startedAt: string;
  submittedAt: string | null;
  summary: {
    totalScore: number;
    maxScore: number;
    correctCount: number;
    incorrectCount: number;
    unattemptedCount: number;
    overallRank: number | null;
    batchRank: number | null;
    percentile: number | null;
    totalQuestions: number;
    attempted: number;
    markedForReviewCount: number;
  };
  questions: ReviewQuestion[];
}

/**
 * GET /attempts/:id/review — the candidate's own answers beside the correct
 * ones. 404s until the result is published, which is deliberate: this is the
 * only student payload that carries answer keys.
 */
export async function fetchAttemptReview(
  attemptId: string,
): Promise<AttemptReview> {
  const token = getToken();
  if (!token) throw new ApiError(401, { message: "Not authenticated" });
  return apiFetch<AttemptReview>(`/attempts/${attemptId}/review`, { token });
}

/** Render an answer for display — MSQ answers are arrays. */
export function formatAnswer(value: string | number | string[] | null): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}
