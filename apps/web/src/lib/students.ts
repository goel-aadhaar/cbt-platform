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

/** GET /students — admin-only, tenant-scoped roster (paginated). */
export function listStudents(
  params: { limit?: number; offset?: number; batchId?: string } = {},
): Promise<Paginated<StudentListItem>> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.batchId) q.set("batchId", params.batchId);
  const qs = q.toString();
  return apiFetch<Paginated<StudentListItem>>(
    `/students${qs ? `?${qs}` : ""}`,
    { token: getToken() ?? undefined },
  );
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
