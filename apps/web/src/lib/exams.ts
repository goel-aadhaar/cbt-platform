import { apiFetch } from "./api";
import { getToken } from "./auth";
import type { Paginated } from "./students";

export type ExamStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  /** Sent back by an admin with a reason; editable and re-submittable. */
  | "REJECTED"
  | "PUBLISHED"
  | "PAUSED"
  | "ARCHIVED";

/**
 * MOCK_TEST (default) or ASSESSMENT (§ Assessments) — the two exam workflows
 * that share this exact same Exam/Attempt/Result engine. See
 * `apps/api/prisma/schema/exam.prisma`'s `ExamKind` doc for the full
 * rationale: same CBT experience, same evaluation/ranking/leaderboard,
 * different authoring/approval/lifecycle rules.
 */
export type ExamKind = "MOCK_TEST" | "ASSESSMENT";

/** Derived, display-level status used across the exam screens. */
export type ExamDisplayStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "LIVE"
  | "PAUSED"
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
  kind: ExamKind;
  resultPolicy: string;
  programId: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  /* Approval workflow (§2.3). */
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  /// Live-exit audit (§ pause/end admin actions). The list endpoint serializes
  /// these so the admin roster can show "paused for X" without a per-row fetch.
  pauseReason: string | null;
  forceEndedAt: string | null;
  forceEndedBy: UserRef | null;
  /** Set once the automatic-closure sweep has processed an ASSESSMENT. */
  autoClosedAt: string | null;
  createdBy: UserRef | null;
  reviewer: UserRef | null;
  approvedBy: UserRef | null;
  _count: { sections: number; questions: number; batches: number };
}

/**
 * GET /exams — teacher/admin, tenant-scoped.
 *
 * Always paginated server-side (§ pagination), but `limit` defaults
 * generously (see the API's QueryExamsDto) — most callers use this to
 * compute a derived view (which exams are live, populate a dropdown) and
 * need the WHOLE catalogue, not a page of it. Pass `limit`/`offset`
 * explicitly only where a screen is genuinely browsing a growing table.
 *
 * `kind` defaults to MOCK_TEST on the SERVER when omitted (§ Assessments) —
 * every call site that predates Assessments doesn't pass it and must keep
 * seeing exactly what it saw before. Pass `kind: "ASSESSMENT"` explicitly
 * for the Assessment screens.
 */
export function listExams(
  params: {
    limit?: number;
    offset?: number;
    kind?: ExamKind;
  } = {},
): Promise<Paginated<ExamListItem>> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.kind) q.set("kind", params.kind);
  const qs = q.toString();
  return apiFetch<Paginated<ExamListItem>>(`/exams${qs ? `?${qs}` : ""}`, {
    token: getToken() ?? undefined,
  });
}

/** Derive the exam's lifecycle state from status + schedule window. */
export function examDisplayStatus(e: ExamListItem): ExamDisplayStatus {
  if (e.status === "DRAFT") return "DRAFT";
  if (e.status === "REVIEW") return "REVIEW";
  // Kept distinct from DRAFT all the way to the screen: the point of the state
  // is that a teacher can pick their sent-back work out of the drafts pile.
  if (e.status === "REJECTED") return "REJECTED";
  // "Qualified" — approved but not yet started by an admin.
  if (e.status === "APPROVED") return "APPROVED";
  if (e.status === "ARCHIVED") return "ARCHIVED";
  // Live but held by an admin (§ live-exit admin actions). PAUSED hides the
  // exam from the student portal but still shows as a distinctive UI state so
  // the admin roster is honest about why no candidates are sitting this.
  if (e.status === "PAUSED") return "PAUSED";
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
