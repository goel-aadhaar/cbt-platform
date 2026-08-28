"use client";

/**
 * Shared offset/limit pager for any server-paginated list (§ pagination).
 * Every list screen used to either fetch a single fixed-size page with no way
 * to reach anything past it, or hand-roll this same Previous/Next block
 * itself — this is the one copy, reused everywhere a `{ items, total }`
 * response needs paging through.
 */
export function PaginationBar({
  offset,
  pageSize,
  total,
  onOffsetChange,
  itemLabel = "items",
  className = "",
  prevLabel = "Previous",
  nextLabel = "Next",
  /**
   * Overrides the default "X–Y of Z <itemLabel>" text — e.g. a
   * reverse-chronological log that would rather say "N recorded actions"
   * than describe itself as a numbered range. Pass `null` (not just an
   * empty string) to omit the caption line entirely — for a caller that
   * already shows its own count elsewhere and wants just the button pair.
   */
  caption,
}: {
  offset: number;
  pageSize: number;
  total: number;
  onOffsetChange: (nextOffset: number) => void;
  /** Plural noun for the count, e.g. "students", "questions". */
  itemLabel?: string;
  className?: string;
  prevLabel?: string;
  nextLabel?: string;
  caption?: React.ReactNode | null;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      {caption !== null && (
        <p className="text-sm text-admin-muted">
          {caption ??
            (total === 0
              ? `No ${itemLabel}`
              : `${from}–${to} of ${total.toLocaleString("en-IN")} ${itemLabel}`)}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
          className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {prevLabel}
        </button>
        <button
          type="button"
          disabled={offset + pageSize >= total}
          onClick={() => onOffsetChange(offset + pageSize)}
          className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
