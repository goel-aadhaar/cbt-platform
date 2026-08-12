/**
 * Student practice library client — mirrors `apps/api/src/modules/practice`.
 *
 * Only questions a teacher curated into the library (`inPracticeLibrary`) and
 * that are APPROVED are served. Answer keys are deliberately NOT part of the
 * question payload: a practice question may also sit in a live exam, so keys
 * are revealed one at a time by `checkAnswer` after the student commits.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

export type PracticeDifficulty = "EASY" | "MEDIUM" | "HARD";
export type PracticeQuestionType = "MCQ" | "MSQ" | "INTEGER";

/** An answer in the shape the backend grades against. */
export type PracticeAnswer = string | number | string[];

export interface PracticeFacets {
  total: number;
  difficulties: Partial<Record<PracticeDifficulty, number>>;
  subjects: {
    subject: string;
    count: number;
    chapters: { chapter: string; topics: string[] }[];
  }[];
}

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
}

export interface PracticeCheckResult {
  questionId: string;
  correct: boolean;
  correctAnswer: PracticeAnswer;
  explanation: string | null;
  marks: number;
}

function token(): string {
  const t = getToken();
  if (!t) throw new ApiError(401, { message: "Not authenticated" });
  return t;
}

/** GET /practice/facets — subjects → chapters → topics, with counts. */
export function fetchPracticeFacets(): Promise<PracticeFacets> {
  return apiFetch<PracticeFacets>("/practice/facets", { token: token() });
}

export interface PracticeQuery {
  subject?: string;
  chapter?: string;
  topic?: string;
  difficulty?: PracticeDifficulty;
  type?: PracticeQuestionType;
  tag?: string;
  /** Server caps this at 50. */
  limit?: number;
}

/** GET /practice/questions — a practice set, answer keys withheld. */
export async function fetchPracticeQuestions(
  query: PracticeQuery = {},
): Promise<PracticeQuestion[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await apiFetch<{ items: PracticeQuestion[]; total: number }>(
    `/practice/questions${suffix}`,
    { token: token() },
  );
  return res.items;
}

/** POST /practice/check — grade one answer and reveal that question's key. */
export function checkAnswer(
  questionId: string,
  answer: PracticeAnswer,
): Promise<PracticeCheckResult> {
  return apiFetch<PracticeCheckResult>("/practice/check", {
    method: "POST",
    body: { questionId, answer },
    token: token(),
  });
}

/* ------------------------------------------------------------------ *
 * Subject slugs                                                       *
 * ------------------------------------------------------------------ */

/** "Human Physiology" → "human-physiology" (route params are slugs). */
export function toSlug(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolve a slug back to the real subject name using the facets. */
export function subjectFromSlug(
  facets: PracticeFacets | null,
  slug: string,
): string | null {
  if (!facets) return null;
  return (
    facets.subjects.find((s) => toSlug(s.subject) === slug)?.subject ?? null
  );
}
