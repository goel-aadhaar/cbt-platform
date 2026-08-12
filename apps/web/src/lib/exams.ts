import { apiFetch } from "./api";
import { getToken } from "./auth";

export type ExamStatus =
  "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";

/** Derived, display-level status used across the exam screens. */
export type ExamDisplayStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "LIVE"
  | "COMPLETED"
  | "PUBLISHED"
  | "ARCHIVED";

interface UserRef {
  id: string;
  name: string;
}

export interface ExamListItem {
  id: string;
  title: string;
  durationMinutes: number;
  status: ExamStatus;
  resultPolicy: string;
  programId: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  /* Approval workflow (§2.3). */
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdBy: UserRef | null;
  reviewer: UserRef | null;
  approvedBy: UserRef | null;
  _count: { sections: number; questions: number; batches: number };
}

/** GET /exams — teacher/admin, tenant-scoped. Returns an array. */
export function listExams(): Promise<ExamListItem[]> {
  return apiFetch<ExamListItem[]>("/exams", { token: getToken() ?? undefined });
}

/** Derive the exam's lifecycle state from status + schedule window. */
export function examDisplayStatus(e: ExamListItem): ExamDisplayStatus {
  if (e.status === "DRAFT") return "DRAFT";
  if (e.status === "REVIEW") return "REVIEW";
  // "Qualified" — approved but not yet started by an admin.
  if (e.status === "APPROVED") return "APPROVED";
  if (e.status === "ARCHIVED") return "ARCHIVED";
  const now = Date.now();
  const start = e.startAt ? Date.parse(e.startAt) : null;
  const end = e.endAt ? Date.parse(e.endAt) : null;
  if (start && now < start) return "SCHEDULED";
  if (start && end && now >= start && now <= end) return "LIVE";
  if (end && now > end) return "COMPLETED";
  return "PUBLISHED";
}

export function formatSchedule(e: ExamListItem): string {
  if (!e.startAt) return "Not scheduled";
  const d = new Date(e.startAt);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
