/**
 * Student practice library client — mirrors `apps/api/src/modules/practice`.
 *
 * Practice is SEPARATE from exams: no attempt, no proctoring, no result, and
 * nothing here ever reaches a report card. Sessions are persisted only so the
 * library can show the student their own progress.
 *
 * Only questions a teacher curated (`inPracticeLibrary`) and that are APPROVED
 * are served. Answer keys are deliberately NOT part of the question payload —
 * a practice question may also sit in a live exam — so keys are revealed one
 * at a time by the grading endpoints after the student commits.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

export type PracticeDifficulty = "EASY" | "MEDIUM" | "HARD";
export type PracticeQuestionType = "MCQ" | "MSQ" | "INTEGER";

/** An answer in the shape the backend grades against. */
export type PracticeAnswer = string | number | string[];

export interface PracticeTopic {
  topic: string;
  count: number;
  /** Distinct questions this student has answered at least once. */
  practised: number;
  /** Share answered correctly at least once, 0–100. */
  mastery: number;
}

export interface PracticeChapter {
  chapter: string;
  count: number;
  practised: number;
  mastery: number;
  topics: PracticeTopic[];
}

export interface PracticeSubject {
  subject: string;
  count: number;
  practised: number;
  mastery: number;
  chapters: PracticeChapter[];
}

export interface PracticeFacets {
  total: number;
  practised: number;
  difficulties: Partial<Record<PracticeDifficulty, number>>;
  subjects: PracticeSubject[];
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
  subject: string;
  chapter: string | null;
  topic: string | null;
  total: number;
  answered: number;
  correct: number;
  /** 0–100 for this session. */
  accuracy: number;
  durationSeconds: number;
  /** This student's average on the same scope, or null on a first attempt. */
  personalAverage: number | null;
  deltaVsAverage: number | null;
}

function token(): string {
  const t = getToken();
  if (!t) throw new ApiError(401, { message: "Not authenticated" });
  return t;
}

/** GET /practice/facets — subjects → chapters → topics, with counts + progress. */
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

/** POST /practice/check — grade one answer outside any session. */
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
 * Sessions                                                            *
 * ------------------------------------------------------------------ */

export interface StartSessionInput {
  subject: string;
  chapter?: string;
  topic?: string;
  difficulty?: PracticeDifficulty;
  size?: number;
  timed?: boolean;
}

/** POST /practice/sessions — opens a session and returns its question set. */
export function startPracticeSession(
  input: StartSessionInput,
): Promise<{ session: PracticeSessionHandle; items: PracticeQuestion[] }> {
  return apiFetch("/practice/sessions", {
    method: "POST",
    body: input,
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

/* ------------------------------------------------------------------ *
 * Practice set presets (the "Choose Your Practice Set" screen)         *
 * ------------------------------------------------------------------ */

export interface PracticePreset {
  id: "quick" | "standard" | "full";
  name: string;
  size: number;
  /** Rough minutes, ~1.8 min per question. */
  minutes: number;
  blurb: string;
  mix: string;
  recommended?: boolean;
}

export const PRACTICE_PRESETS: PracticePreset[] = [
  {
    id: "quick",
    name: "Quick Practice",
    size: 10,
    minutes: 15,
    blurb: "A short warm-up you can finish in a break.",
    mix: "Mostly Easy",
  },
  {
    id: "standard",
    name: "Standard Set",
    size: 25,
    minutes: 45,
    blurb: "A balanced set covering the core of the topic.",
    mix: "Balanced",
    recommended: true,
  },
  {
    id: "full",
    name: "Full Topic",
    size: 50,
    minutes: 90,
    blurb: "Everything available, for a proper revision run.",
    mix: "Rigorous",
  },
];

/* ------------------------------------------------------------------ *
 * Subject slugs                                                       *
 * ------------------------------------------------------------------ */

/** "Human Physiology" → "human-physiology" (route params are slugs). */
export function toSlug(value: string): string {
  return value
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

/** Resolve a chapter slug within a subject. */
export function chapterFromSlug(
  subject: PracticeSubject | null,
  slug: string,
): PracticeChapter | null {
  if (!subject) return null;
  return subject.chapters.find((c) => toSlug(c.chapter) === slug) ?? null;
}
