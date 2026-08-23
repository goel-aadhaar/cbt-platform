import type { ExamDisplayStatus } from "@/lib/exams";

/** Shared status → color mapping, also used for the calendar's day dots. */
export const EXAM_STATUS_COLOR: Record<ExamDisplayStatus, string> = {
  LIVE: "bg-danger/10 text-danger",
  SCHEDULED: "bg-[#e7edff] text-[#3d5afe]",
  DRAFT: "bg-admin-surface text-admin-muted",
  REVIEW: "bg-warn/15 text-warn",
  APPROVED: "bg-admin/10 text-admin",
  COMPLETED: "bg-admin-mint/50 text-admin",
  PUBLISHED: "bg-admin-mint/50 text-admin",
  REJECTED: "bg-danger-soft text-danger",
  ARCHIVED: "bg-admin-surface text-admin-muted",
};

/** Solid-dot variant of the same palette, for compact calendar markers. */
export const EXAM_STATUS_DOT: Record<ExamDisplayStatus, string> = {
  LIVE: "bg-danger",
  SCHEDULED: "bg-[#3d5afe]",
  DRAFT: "bg-admin-subtle",
  REVIEW: "bg-warn",
  APPROVED: "bg-admin",
  REJECTED: "bg-danger",
  COMPLETED: "bg-admin",
  PUBLISHED: "bg-admin",
  ARCHIVED: "bg-admin-subtle",
};

export function ExamStatusPill({ status }: { status: ExamDisplayStatus }) {
  const label =
    status === "APPROVED"
      ? "QUALIFIED"
      : status === "REJECTED"
        ? "SENT BACK"
        : status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${EXAM_STATUS_COLOR[status]}`}
    >
      {status === "LIVE" && (
        <span className="size-1.5 rounded-full bg-danger" />
      )}
      {label}
    </span>
  );
}
