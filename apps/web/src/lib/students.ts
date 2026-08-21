import { apiFetch } from "./api";
import { getToken } from "./auth";

/** A row from GET /students (the flattened Student+User+Batch view). */
export interface StudentListItem {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  batch: { id: string; name: string } | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Roster orderings the API accepts. Mirrors StudentSort on the server. */
export type StudentSort =
  "roll_asc" | "roll_desc" | "name_asc" | "name_desc" | "newest" | "oldest";

export interface StudentRoster extends Paginated<StudentListItem> {
  /**
   * Status tallies over the WHOLE filtered set, not just the returned page —
   * the roster cards and tabs must stay correct past the 200-row page cap.
   */
  counts: { all: number; active: number; disabled: number; pending: number };
}

export interface StudentQuery {
  limit?: number;
  offset?: number;
  batchId?: string;
  classId?: string;
  programId?: string;
  status?: StudentListItem["status"];
  search?: string;
  sort?: StudentSort;
}

/** GET /students — admin-only, tenant-scoped roster (paginated + filtered). */
export function listStudents(
  params: StudentQuery = {},
): Promise<StudentRoster> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.batchId) q.set("batchId", params.batchId);
  if (params.classId) q.set("classId", params.classId);
  if (params.programId) q.set("programId", params.programId);
  if (params.status) q.set("status", params.status);
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return apiFetch<StudentRoster>(`/students${qs ? `?${qs}` : ""}`, {
    token: getToken() ?? undefined,
  });
}

const auth = () => ({ token: getToken() ?? undefined });

/** DELETE /students/:id — archives the student (sets them DISABLED). */
export function deactivateStudent(id: string): Promise<StudentListItem> {
  return apiFetch(`/students/${id}`, { method: "DELETE", ...auth() });
}

/** POST /students/:id/reactivate — undoes a deactivation. */
export function reactivateStudent(id: string): Promise<StudentListItem> {
  return apiFetch(`/students/${id}/reactivate`, { method: "POST", ...auth() });
}

/**
 * POST /students/:id/resend-invite — re-sends the activation email for a
 * student who is still PENDING, with a fresh token and TTL.
 */
export function resendStudentInvite(id: string): Promise<StudentListItem> {
  return apiFetch(`/students/${id}/resend-invite`, {
    method: "POST",
    ...auth(),
  });
}
