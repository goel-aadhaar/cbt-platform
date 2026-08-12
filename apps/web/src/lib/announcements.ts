/**
 * Announcements client — mirrors `apps/api/src/modules/announcements`.
 *
 * Two audiences, two endpoints: staff author against `/announcements`
 * (drafts included), students read `/me/announcements`, which the server has
 * already filtered to published, unexpired notices for their own batch.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

export type AnnouncementCategory =
  "GENERAL" | "EXAM" | "RESULT" | "SCHEDULE" | "MAINTENANCE";

export type AnnouncementAudience = "ALL_STUDENTS" | "BATCH";

/** What a student receives — no draft metadata, no author email. */
export interface StudentAnnouncement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  pinned: boolean;
  publishedAt: string;
  createdBy: { name: string };
}

/** The authoring view, which also carries targeting and draft state. */
export interface StaffAnnouncement extends Omit<
  StudentAnnouncement,
  "publishedAt"
> {
  publishedAt: string | null;
  audience: AnnouncementAudience;
  batchId: string | null;
  batch: { id: string; name: string } | null;
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

/** GET /announcements — every notice in the tenant, drafts included. */
export function listAnnouncements(): Promise<StaffAnnouncement[]> {
  return apiFetch<StaffAnnouncement[]>("/announcements", { token: token() });
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  category?: AnnouncementCategory;
  audience?: AnnouncementAudience;
  batchId?: string;
  pinned?: boolean;
  /** Publish straight away; omit to save as a draft. */
  publish?: boolean;
  expiresAt?: string;
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
