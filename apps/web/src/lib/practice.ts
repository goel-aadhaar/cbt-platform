/**
 * Student DPP attempts — mirrors `apps/api/src/modules/practice`.
 *
 * A session is an attempt at one named, teacher-curated Daily Practice Paper
 * (see `dpp.ts` for the authoring side). No timer, no proctoring, no
 * Attempt/Result row: practice stays separate from exams by design.
 *
 * Answer keys are deliberately NOT part of the question payload — a DPP
 * question may also sit in a live exam — so keys are revealed one at a time
 * by the grading endpoints after the student commits.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

export type PracticeDifficulty = "EASY" | "MEDIUM" | "HARD";
export type PracticeQuestionType = "MCQ" | "MSQ" | "INTEGER";

/** An answer in the shape the backend grades against. */
export type PracticeAnswer = string | number | string[];

export interface PracticeQuestion {
  id: string;
  subject: string;
  chapter: string;
  topic: string | null;
  difficulty: PracticeDifficulty;
  type: PracticeQuestionType;
  statement: string;
  options: { key: string; text: string }[] | null;
  marks: number;
  negativeMarks: number;
  /** Diagrams attached to the question (§2.7), already resolved to URLs. */
  media?: { key: string; url: string }[];
}

export interface PracticeCheckResult {
  questionId: string;
  correct: boolean;
  correctAnswer: PracticeAnswer;
  explanation: string | null;
  marks: number;
}

export interface PracticeSessionHandle {
  id: string;
  startedAt: string;
  totalCount: number;
  timed: boolean;
}

export interface PracticeSummary {
  sessionId: string;
  dppId: string | null;
  subject: string;
  chapter: string | null;
  total: number;
  answered: number;
  correct: number;
  /** 0–100 for this attempt. */
  accuracy: number;
  durationSeconds: number;
  /** This student's average on past attempts at the SAME DPP, or null on a
   * first attempt. */
  personalAverage: number | null;
  deltaVsAverage: number | null;
}

function token(): string {
  const t = getToken();
  if (!t) throw new ApiError(401, { message: "Not authenticated" });
  return t;
}

/**
 * POST /practice/sessions — opens (or resumes) a session over one named DPP
 * and returns its full, fixed question set.
 */
export function startPracticeSession(
  dppId: string,
): Promise<{ session: PracticeSessionHandle; items: PracticeQuestion[] }> {
  return apiFetch("/practice/sessions", {
    method: "POST",
    body: { dppId },
    token: token(),
  });
}

/** POST /practice/sessions/:id/answer — grade AND record one answer. */
export function answerInSession(
  sessionId: string,
  questionId: string,
  answer: PracticeAnswer,
): Promise<PracticeCheckResult> {
  return apiFetch<PracticeCheckResult>(
    `/practice/sessions/${sessionId}/answer`,
    { method: "POST", body: { questionId, answer }, token: token() },
  );
}

/** POST /practice/sessions/:id/complete — close it and get the summary. */
export function completePracticeSession(
  sessionId: string,
  durationSeconds: number,
): Promise<PracticeSummary> {
  return apiFetch<PracticeSummary>(`/practice/sessions/${sessionId}/complete`, {
    method: "POST",
    body: { durationSeconds },
    token: token(),
  });
}
