/**
 * Daily Practice Papers (§ Product Structure) — the teacher/admin authoring
 * side. Mirrors `apps/api/src/modules/practice/dpp.*`.
 *
 * Created directly from the Question Bank: filter, tick, name it, assign
 * batches. No approval step, no Practice Bank in between.
 */

import { apiFetch } from "./api";
import { getToken } from "./auth";

function auth() {
  return { token: getToken() ?? undefined };
}

export interface DppQuestionRef {
  order: number;
  question: {
    id: string;
    statement: string;
    subject: string;
    chapter: string;
    topic: string | null;
    difficulty: string;
    type: string;
  };
}

export interface DppItem {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  subject: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  batches: { id: string; name: string }[];
  _count: { questions: number };
}

export interface DppDetail extends DppItem {
  questions: DppQuestionRef[];
}

export interface CreateDppInput {
  title: string;
  description?: string;
  subjectId?: string;
  chapterId?: string;
  questionIds: string[];
  batchIds: string[];
}

export type UpdateDppInput = Partial<CreateDppInput>;

/** GET /dpps — teacher/admin, tenant + batch scoped. */
export function listDpps(subjectId?: string): Promise<DppItem[]> {
  const qs = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  return apiFetch<DppItem[]>(`/dpps${qs}`, auth());
}

export function getDpp(id: string): Promise<DppDetail> {
  return apiFetch<DppDetail>(`/dpps/${id}`, auth());
}

export function createDpp(input: CreateDppInput): Promise<DppItem> {
  return apiFetch<DppItem>("/dpps", { method: "POST", body: input, ...auth() });
}

export function updateDpp(id: string, input: UpdateDppInput): Promise<DppItem> {
  return apiFetch<DppItem>(`/dpps/${id}`, {
    method: "PATCH",
    body: input,
    ...auth(),
  });
}

export function removeDpp(id: string): Promise<{ removed: string }> {
  return apiFetch(`/dpps/${id}`, { method: "DELETE", ...auth() });
}

/* ------------------------------------------------------------------ *
 * Student                                                              *
 * ------------------------------------------------------------------ */

export interface MyDppAttempt {
  sessionId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  answered: number;
  correct: number;
  total: number;
}

export interface MyDpp {
  id: string;
  title: string;
  description: string | null;
  subject: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
  questionCount: number;
  attempt: MyDppAttempt | null;
}

/** GET /me/dpps — DPPs assigned to the calling student's own batch. */
export function listMyDpps(): Promise<MyDpp[]> {
  return apiFetch<MyDpp[]>("/me/dpps", auth());
}
