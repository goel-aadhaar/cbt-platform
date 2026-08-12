"use client";

import type { ExamResultRow } from "@/lib/admin";

import { useState } from "react";

import { downloadResultExport, type ExportFormat } from "@/lib/admin";
import { AnswerKeyPanel } from "./answer-key-panel";
import { XIcon } from "./icons";

const BANDS = ["0-20", "21-40", "41-60", "61-80", "81-100"];

/** Bucket scores into the five display bands as a % of the cohort. */
function distribution(results: ExamResultRow[]) {
  const counts = [0, 0, 0, 0, 0];
  for (const r of results) {
    const pct = r.maxScore > 0 ? (r.totalScore / r.maxScore) * 100 : 0;
    const idx = Math.min(4, Math.max(0, Math.floor(pct / 20.0001)));
    counts[idx] += 1;
  }
  const total = results.length || 1;
  return BANDS.map((band, i) => ({
    band,
    pct: Math.round((counts[i] / total) * 100),
  }));
}

/**
 * Exam result detail drawer — opened from a Results row "Review". Summarises the
 * exam and links to the Publish / Recalculate flows. (Approximation: its Figma
 * capture, 119:18178, was a mid-transition render.)
 *
 * Renders live rows from GET /exams/:id/results when given; falls back to the
 * design's placeholder copy when opened without a selection.
 */
export function ResultDetailDrawer({
  open,
  onClose,
  onPublish,
  onRecalculate,
  examTitle,
  examId,
  results,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onPublish: () => void;
  onRecalculate: () => void;
  examTitle?: string;
  examId?: string;
  results?: ExamResultRow[];
  /** Fired after an answer-key correction so the caller can refresh. */
  onChanged?: () => void;
}) {
  if (!open) return null;

  const rows = results ?? [];
  const maxScore = rows[0]?.maxScore ?? 0;
  const avg =
    rows.length > 0
      ? Math.round(
          (rows.reduce((n, r) => n + r.totalScore, 0) /
            rows.length /
            (maxScore || 1)) *
            100,
        )
      : 0;
  const highest =
    rows.length > 0 ? Math.max(...rows.map((r) => r.totalScore)) : 0;
  const passed = rows.filter(
    (r) => maxScore > 0 && r.totalScore / r.maxScore >= 0.33,
  ).length;
  const published = rows.length > 0 && rows.every((r) => r.published);

  const STATS = [
    { label: "Participants", value: String(rows.length) },
    { label: "Avg. Score", value: rows.length ? `${avg}%` : "—" },
    {
      label: "Pass Rate",
      value: rows.length ? `${Math.round((passed / rows.length) * 100)}%` : "—",
    },
    { label: "Highest", value: rows.length ? String(highest) : "—" },
  ];

  const DIST = distribution(rows);
  const max = Math.max(1, ...DIST.map((d) => d.pct));

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
                {examTitle ?? "Exam"}
              </h2>
              {rows.length > 0 && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    published
                      ? "bg-admin-mint/50 text-admin"
                      : "bg-admin-bg text-admin-muted"
                  }`}
                >
                  {published ? "PUBLISHED" : "HELD"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-admin-muted">
              {rows.length > 0
                ? `${rows.length} participants • max ${maxScore}`
                : "No results yet"}
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

          {rows.length > 0 && (
            <>
              <h3 className="mt-8 font-bold text-admin-ink">Ranked Results</h3>
              <div className="mt-3 overflow-hidden rounded-xl border border-admin-line/60">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-admin-bg/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      <th className="px-4 py-2">Rank</th>
                      <th className="px-4 py-2">Candidate</th>
                      <th className="px-4 py-2">Roll</th>
                      <th className="px-4 py-2 text-right">Score</th>
                      <th className="px-4 py-2 text-right">%ile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-line/50">
                    {rows.slice(0, 10).map((r) => (
                      <tr
                        key={r.id}
                        className={r.attempt.flagged ? "bg-[#fbf3f2]" : ""}
                      >
                        <td className="px-4 py-2 font-semibold text-admin-ink">
                          {r.overallRank ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-admin-ink">
                          {r.student.user.name}
                          {r.attempt.flagged && (
                            <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                              FLAGGED
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-admin-muted [font-family:var(--font-courier-prime)]">
                          {r.student.rollNumber}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-admin-ink">
                          {r.totalScore}
                          <span className="font-normal text-admin-muted">
                            /{r.maxScore}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-admin-muted">
                          {r.percentile == null
                            ? "—"
                            : `${Math.round(r.percentile * 10) / 10}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && (
                  <p className="border-t border-admin-line/50 px-4 py-2 text-xs text-admin-muted">
                    Showing top 10 of {rows.length}.
                  </p>
                )}
              </div>
            </>
          )}

          {examId && <AnswerKeyPanel examId={examId} onChanged={onChanged} />}

          <div className="mt-8 flex items-center gap-2 rounded-xl border border-admin-line/60 bg-admin-bg p-4 text-sm text-admin-muted">
            {rows.length === 0
              ? "This exam has no evaluated results yet. Run Evaluate from the results table first."
              : published
                ? "Results are visible to students. Use Hold to withdraw them, or Recalculate to apply bonus marks then re-publish."
                : "Results are evaluated but not yet released. Publish to make them visible to students."}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
          {examId && rows.length > 0 && <ExportButtons examId={examId} />}
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

/** CSV / Excel / PDF downloads for the ranked result sheet (§2.14). */
function ExportButtons({ examId }: { examId: string }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: ExportFormat) {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      await downloadResultExport(examId, format);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mr-auto flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase text-admin-muted">
        Export
      </span>
      {(["csv", "xlsx", "pdf"] as ExportFormat[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => void run(f)}
          disabled={busy !== null}
          className="rounded-lg border border-admin-line bg-white px-3 py-1.5 text-xs font-bold uppercase text-admin-ink hover:bg-admin-bg disabled:cursor-wait disabled:opacity-50"
        >
          {busy === f ? "…" : f === "xlsx" ? "Excel" : f}
        </button>
      ))}
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
