/**
 * Exam catalogue client (§2.3) — mirrors `apps/api/src/modules/exam-categories`.
 *
 * Administrators curate the catalogue; teachers read it while authoring. An
 * approved paper is named "<Category> - <n>", so `nextName` is what the next
 * approved paper in a category will be called.
 */

import { apiFetch } from "./api";
import { getToken } from "./auth";

export interface ExamCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  examCount: number;
  /** What the next approved paper in this category will be titled. */
  nextName: string;
}

const auth = () => ({ token: getToken() ?? undefined });

export function listExamCategories(
  activeOnly = false,
): Promise<{ items: ExamCategory[]; total: number }> {
  return apiFetch(
    `/exam-categories${activeOnly ? "?activeOnly=true" : ""}`,
    auth(),
  );
}

export function createExamCategory(body: {
  name: string;
  description?: string;
}): Promise<ExamCategory> {
  return apiFetch("/exam-categories", { method: "POST", body, ...auth() });
}

export function updateExamCategory(
  id: string,
  body: { name?: string; description?: string; isActive?: boolean },
): Promise<ExamCategory> {
  return apiFetch(`/exam-categories/${id}`, {
    method: "PATCH",
    body,
    ...auth(),
  });
}

/**
 * Delete a category. The API refuses once papers reference it — surface that
 * refusal rather than forcing, since those papers would lose the name
 * candidates saw them under.
 */
export function deleteExamCategory(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiFetch(`/exam-categories/${id}`, { method: "DELETE", ...auth() });
}
