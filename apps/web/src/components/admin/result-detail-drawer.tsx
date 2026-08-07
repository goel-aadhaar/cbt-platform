"use client";

import { XIcon } from "./icons";

const STATS = [
  { label: "Participants", value: "145" },
  { label: "Avg. Score", value: "72%" },
  { label: "Pass Rate", value: "88%" },
  { label: "Highest", value: "98" },
];

// Score-distribution buckets (0-20 … 80-100) as % of cohort.
const DIST = [
  { band: "0-20", pct: 6 },
  { band: "21-40", pct: 14 },
  { band: "41-60", pct: 28 },
  { band: "61-80", pct: 34 },
  { band: "81-100", pct: 18 },
];

/**
 * Exam result detail drawer — opened from a Results row "Review". Summarises the
 * exam and links to the Publish / Recalculate flows. (Approximation: its Figma
 * capture, 119:18178, was a mid-transition render.)
 */
export function ResultDetailDrawer({
  open,
  onClose,
  onPublish,
  onRecalculate,
}: {
  open: boolean;
  onClose: () => void;
  onPublish: () => void;
  onRecalculate: () => void;
}) {
  if (!open) return null;
  const max = Math.max(...DIST.map((d) => d.pct));

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Results / Exam Detail
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h2 className="text-xl font-bold text-admin-ink">
                Biology Mid-Term Alpha
              </h2>
              <span className="rounded-full bg-admin-mint/50 px-3 py-1 text-xs font-bold text-admin">
                PUBLISHED
              </span>
            </div>
            <p className="mt-1 text-sm text-admin-muted">
              Class XII - Science • Oct 12, 2023
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-admin-line/60 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  {s.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-admin-ink">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <h3 className="mt-8 font-bold text-admin-ink">Score Distribution</h3>
          <div className="mt-4 flex h-48 items-end gap-4">
            {DIST.map((d) => (
              <div
                key={d.band}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-admin-2/40"
                    style={{ height: `${(d.pct / max) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-admin-subtle">
                  {d.band}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-2 rounded-xl border border-admin-line/60 bg-admin-bg p-4 text-sm text-admin-muted">
            Results are published for all batches. Use Recalculate to apply
            bonus marks or drop questions, then re-publish.
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
          <button
            onClick={onRecalculate}
            className="rounded-lg border border-admin-line bg-white px-6 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            Recalculate
          </button>
          <button
            onClick={onPublish}
            className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            Publish Results
          </button>
        </footer>
      </div>
    </div>
  );
}
