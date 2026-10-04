import { ApiError, apiFetch } from "./api";
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
  /** Name of the staff member whose invite created this account, if any. */
  addedBy: string | null;
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

/** Most students one Export Selected may name (the API's cap). */
export const EXPORT_SELECTED_MAX = 1000;

export interface StudentExportRequest extends Omit<
  StudentQuery,
  "limit" | "offset"
> {
  /**
   * Only these students (Export Selected). Omit for Export All. An empty
   * array is sent as-is and rejected by the API, so it can never widen into
   * "every student".
   */
  ids?: string[];
  /** Add each student's CBT results (one row per result). */
  includeResults: boolean;
}

/** Counts the server reports for the file; null when the headers are not
 * readable (a cross-origin API that does not expose them). */
export interface StudentExportSummary {
  students: number | null;
  resultRows: number | null;
}

/**
 * POST /students/export — the server selects the students and builds the CSV;
 * this only saves it. POST rather than GET so a large selection of ids is not
 * cut off by a URL length limit. fetch + blob because a plain link cannot
 * carry the bearer token.
 */
export async function exportStudents(
  req: StudentExportRequest,
): Promise<StudentExportSummary> {
  const path = "/students/export";
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const body = Object.fromEntries(
    Object.entries({ ...req, search: req.search?.trim() }).filter(
      ([, v]) => v !== undefined && v !== "",
    ),
  );
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken() ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null), path);
  }
  const count = (name: string) => {
    const v = res.headers.get(name);
    return v !== null && /^\d+$/.test(v) ? Number(v) : null;
  };
  const filename =
    /filename="([^"]+)"/.exec(
      res.headers.get("Content-Disposition") ?? "",
    )?.[1] ?? `codonmind-students-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return {
    students: count("X-Export-Students"),
    resultRows: count("X-Export-Result-Rows"),
  };
}

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

/** Update the editable fields on a Student profile. */
export interface UpdateStudentInput {
  /** Renamed student. Optional: a blank stays untouched. */
  name?: string;
  /** Reassign to a different batch in the same institute. */
  batchId?: string;
}

/** PATCH /students/:id — partial update of name and/or batch. */
export function updateStudent(
  id: string,
  dto: UpdateStudentInput,
): Promise<StudentListItem> {
  return apiFetch(`/students/${id}`, {
    method: "PATCH",
    body: dto,
    ...auth(),
  });
}

/**
 * POST /students/reassign-batch — bulk re-batch rows. The destination batch
 * is read from the actor's institute, never from the request source, so the
 * same call cannot accidentally relocate a student who has already moved.
 */
export function reassignStudentsBatch(
  studentIds: string[],
  targetBatchId: string,
): Promise<{ moved: number; targetBatchId: string }> {
  return apiFetch(`/students/reassign-batch`, {
    method: "POST",
    body: { studentIds, targetBatchId },
    ...auth(),
  });
}
