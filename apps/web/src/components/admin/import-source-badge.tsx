import Link from "next/link";

import { sourceNumberText, type QuestionListItem } from "@/lib/questions";

/**
 * "Q10" for a question that came from an upload (its position in the source
 * file), plus — while it is still a draft — a way back to that upload's review
 * screen. Renders nothing for a question typed in by hand.
 */
export function ImportSourceBadge({
  question: q,
  reviewBase,
}: {
  question: Pick<
    QuestionListItem,
    "sourceSeq" | "sourceLabel" | "importRunId" | "status"
  >;
  /** `/admin/questions/review` or `/teacher/questions/review`. */
  reviewBase: string;
}) {
  const label = sourceNumberText(q);
  if (!label) return null;
  const reviewable =
    q.importRunId && (q.status === "DRAFT" || q.status === "REJECTED");
  return (
    <span className="inline-flex items-center gap-2">
      <span
        title="Position in the uploaded file"
        className="rounded bg-admin/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-admin"
      >
        {label}
      </span>
      {reviewable && (
        <Link
          href={`${reviewBase}?run=${q.importRunId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] font-semibold text-admin hover:underline"
        >
          Review import
        </Link>
      )}
    </span>
  );
}
