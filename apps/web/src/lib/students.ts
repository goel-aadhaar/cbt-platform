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
  params: { limit?: number; offset?: number } = {},
): Promise<Paginated<StudentListItem>> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<Paginated<StudentListItem>>(
    `/students${qs ? `?${qs}` : ""}`,
    { token: getToken() ?? undefined },
  );
}
