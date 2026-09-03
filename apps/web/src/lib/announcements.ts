/**
 * Announcements client — mirrors `apps/api/src/modules/announcements`.
 *
 * Two audiences, two endpoints: staff author against `/announcements`
 * (drafts included), students read `/me/announcements`, which the server has
 * already filtered to published, unexpired notices for their own batch.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";
import type { Paginated } from "./students";

export type AnnouncementCategory =
  "GENERAL" | "EXAM" | "RESULT" | "SCHEDULE" | "MAINTENANCE";

/**
 * Who a notice reaches. Narrowing is the ABSENCE of ids: `toStudents` with an
 * empty `batches` means every student, not none. Mirrors the server (§2.9).
 */
export interface AnnouncementTargets {
  toStudents: boolean;
  toTeachers: boolean;
  batches: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
}

/** What a student receives — no draft metadata, no author email. */
export interface StudentAnnouncement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  pinned: boolean;
  publishedAt: string;
  /** Media keys for downloadable files on this notice. */
  attachmentKeys: string[];
  createdBy: { name: string };
}

/** The authoring view, which also carries targeting and draft state. */
export interface StaffAnnouncement extends Omit<
  StudentAnnouncement,
  "publishedAt"
> {
  publishedAt: string | null;
  toStudents: boolean;
  toTeachers: boolean;
  /** Server returns join rows; the UI flattens them. */
  batches: { batch: { id: string; name: string } }[];
  teachers: { teacher: { id: string; name: string } }[];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function token(): string {
  const t = getToken();
  if (!t) throw new ApiError(401, { message: "Not authenticated" });
  return t;
}

/** GET /me/announcements — the calling student's feed. */
export function fetchMyAnnouncements(): Promise<StudentAnnouncement[]> {
  return apiFetch<StudentAnnouncement[]>("/me/announcements", {
    token: token(),
  });
}

/**
 * GET /me/announcements/unread-count — the number on the bell.
 *
 * A student who has never opened their announcements counts everything
 * currently published, not zero: the badge exists to tell a first-time visitor
 * there is something to read.
 */
export function fetchUnreadAnnouncementCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/me/announcements/unread-count", {
    token: token(),
  });
}

/** POST /me/announcements/seen — clears the badge. */
export function markAnnouncementsSeen(): Promise<{ count: number }> {
  return apiFetch("/me/announcements/seen", {
    method: "POST",
    token: token(),
  });
}

/**
 * GET /announcements — every notice in the tenant, drafts included.
 * Always paginated server-side (§ pagination); `limit` defaults generously.
 */
export function listAnnouncements(
  params: { limit?: number; offset?: number } = {},
): Promise<Paginated<StaffAnnouncement>> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<Paginated<StaffAnnouncement>>(
    `/announcements${qs ? `?${qs}` : ""}`,
    { token: token() },
  );
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  category?: AnnouncementCategory;
  /** Defaults to students-only when neither is given. */
  toStudents?: boolean;
  toTeachers?: boolean;
  /** Empty or omitted = everyone in that audience. */
  batchIds?: string[];
  teacherIds?: string[];
  pinned?: boolean;
  /** Publish straight away; omit to save as a draft. */
  publish?: boolean;
  expiresAt?: string;
  /** Media keys of uploaded documents to attach. */
  attachmentKeys?: string[];
}

export function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<StaffAnnouncement> {
  return apiFetch<StaffAnnouncement>("/announcements", {
    method: "POST",
    body: input,
    token: token(),
  });
}

/**
 * Fields an edit may change. `PATCH /announcements/:id` has always supported
 * this — there was simply no client function and no UI control, so a published
 * notice with a typo could only be deleted and retyped.
 *
 * Every field is optional and absent means "leave alone", matching the server's
 * partial-update contract. `expiresAt: null` is an explicit clear, which is
 * why it is nullable rather than merely optional.
 */
export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  category?: AnnouncementCategory;
  toStudents?: boolean;
  toTeachers?: boolean;
  /** Omit to leave targeting alone; [] widens back to everyone. */
  batchIds?: string[];
  teacherIds?: string[];
  pinned?: boolean;
  expiresAt?: string | null;
  /** Omit to leave attachments alone; `[]` clears them. */
  attachmentKeys?: string[];
}

export function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
): Promise<StaffAnnouncement> {
  return apiFetch<StaffAnnouncement>(`/announcements/${id}`, {
    method: "PATCH",
    body: input,
    token: token(),
  });
}

export function publishAnnouncement(id: string): Promise<StaffAnnouncement> {
  return apiFetch<StaffAnnouncement>(`/announcements/${id}/publish`, {
    method: "POST",
    token: token(),
  });
}

export function unpublishAnnouncement(id: string): Promise<StaffAnnouncement> {
  return apiFetch<StaffAnnouncement>(`/announcements/${id}/unpublish`, {
    method: "POST",
    token: token(),
  });
}

export function deleteAnnouncement(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiFetch(`/announcements/${id}`, { method: "DELETE", token: token() });
}

/** Display styling per category. */
export const CATEGORY_LOOK: Record<
  AnnouncementCategory,
  { label: string; className: string }
> = {
  GENERAL: { label: "General", className: "bg-admin-line/30 text-admin-muted" },
  EXAM: { label: "Exam", className: "bg-blue-50 text-blue-700" },
  RESULT: { label: "Result", className: "bg-emerald-50 text-emerald-700" },
  SCHEDULE: { label: "Schedule", className: "bg-amber-50 text-amber-700" },
  MAINTENANCE: { label: "Maintenance", className: "bg-red-50 text-red-700" },
};
