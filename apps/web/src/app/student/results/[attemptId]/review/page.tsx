"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import { ApiError } from "@/lib/api";
import {
  fetchAttemptReview,
  formatAnswer,
  type AttemptReview,
  type ReviewQuestion,
  type ReviewStatus,
} from "@/lib/student";

const PAGE_SIZE = 10;

const STATUS_STYLE: Record<ReviewStatus, { label: string; cls: string }> = {
  CORRECT: { label: "Correct", cls: "bg-success/10 text-success" },
  INCORRECT: { label: "Incorrect", cls: "bg-danger/10 text-danger" },
  UNATTEMPTED: { label: "Not attempted", cls: "bg-fill text-muted" },
  // Post-exam remediation (§2.9) — the candidate should see why the marks
  // differ from a plain right/wrong reading of their answer.
  BONUS: { label: "Bonus", cls: "bg-brand-soft text-brand" },
  DROPPED: { label: "Dropped", cls: "bg-fill text-muted" },
};

const FILTERS: { key: "ALL" | ReviewStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "CORRECT", label: "Correct" },
  { key: "INCORRECT", label: "Incorrect" },
  { key: "UNATTEMPTED", label: "Skipped" },
];

/**
 * Per-question evaluation of a submitted attempt.
 *
 * Backed by GET /attempts/:id/review, which 404s until an administrator
 * publishes the result — that 404 is the "pending" state, not a failure.
 */
export default function AttemptReviewPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId ?? "";

  const [review, setReview] = useState<AttemptReview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | ReviewStatus>("ALL");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetchAttemptReview(attemptId);
        if (cancelled) return;
        setReview(r);
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setPending(true);
        else
          setError(
            e instanceof Error ? e.message : "Could not load your evaluation",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const filtered = useMemo(
    () =>
      (review?.questions ?? []).filter(
        (q) => filter === "ALL" || q.status === filter,
      ),
    [review, filter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const crumbs = [
    { label: "Performance Reports", href: "/student/reports" },
    {
      label: review?.exam.title ?? "Result",
      href: `/student/results/${attemptId}`,
    },
    "Evaluation",
  ];

  if (loading) {
    return (
      <StudentShell breadcrumb={crumbs}>
        <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
      </StudentShell>
    );
  }

  if (pending) {
    return (
      <StudentShell breadcrumb={crumbs}>
        <div className="mx-auto max-w-lg rounded-2xl border border-admin-line/60 bg-white p-10 text-center">
          <h1 className="text-xl font-bold text-admin-ink">
            Evaluation not released yet
          </h1>
          <p className="mt-2 text-sm text-admin-muted">
            Your answers become visible once your institute publishes the result
            for this exam.
          </p>
          <Link
            href="/student/reports"
            className="mt-5 inline-block rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
          >
            Back to reports
          </Link>
        </div>
      </StudentShell>
    );
  }

  if (error || !review) {
    return (
      <StudentShell breadcrumb={crumbs}>
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error ?? "Could not load your evaluation."}
        </p>
      </StudentShell>
    );
  }

  const s = review.summary;

  return (
    <StudentShell breadcrumb={crumbs}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
          {review.exam.title}
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Question-by-question evaluation of your attempt
          {review.submittedAt
            ? ` submitted on ${new Date(review.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`
            : ""}
          .
        </p>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Score" value={`${s.totalScore} / ${s.maxScore}`} strong />
        <Stat label="Total questions" value={s.totalQuestions} />
        <Stat label="Attempted" value={s.attempted} />
        <Stat label="Correct" value={s.correctCount} tone="good" />
        <Stat label="Incorrect" value={s.incorrectCount} tone="bad" />
        <Stat label="Unattempted" value={s.unattemptedCount} />
      </div>

      {(s.overallRank !== null || s.percentile !== null) && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {s.overallRank !== null && (
            <Stat label="Overall rank" value={s.overallRank} />
          )}
          {s.batchRank !== null && (
            <Stat label="Batch rank" value={s.batchRank} />
          )}
          {s.percentile !== null && (
            <Stat label="Percentile" value={s.percentile.toFixed(2)} />
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "ALL"
              ? review.questions.length
              : review.questions.filter((q) => q.status === f.key).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setFilter(f.key);
                setPage(0);
              }}
              aria-pressed={filter === f.key}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                filter === f.key
                  ? "bg-admin text-white"
                  : "border border-admin-line bg-white text-admin-ink hover:bg-admin-bg"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Question table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-admin-line bg-admin-bg/40 text-xs font-bold uppercase tracking-wide text-admin-muted">
                <th className="px-4 py-3">Q</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Your answer</th>
                <th className="px-4 py-3">Correct answer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Marks</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-admin-muted"
                  >
                    No questions in this filter.
                  </td>
                </tr>
              ) : (
                rows.map((q) => (
                  <QuestionRow
                    key={q.questionId}
                    q={q}
                    open={open === q.number}
                    onToggle={() =>
                      setOpen((cur) => (cur === q.number ? null : q.number))
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-line/60 px-4 py-3">
          <span className="text-xs text-admin-muted">
            {filtered.length === 0
              ? "No questions"
              : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min(
                  (safePage + 1) * PAGE_SIZE,
                  filtered.length,
                )} of ${filtered.length}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-40"
            >
              Previous
            </button>
            {/* Direct page numbers: jumping to "question 40-ish" is the common
                move when reviewing a long paper. */}
            {Array.from({ length: pageCount }, (_, i) => i)
              .filter(
                (i) =>
                  i === 0 || i === pageCount - 1 || Math.abs(i - safePage) <= 1,
              )
              .map((i, idx, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {idx > 0 && arr[idx - 1] !== i - 1 && (
                    <span className="px-1 text-xs text-admin-muted">…</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPage(i)}
                    aria-current={i === safePage ? "page" : undefined}
                    className={`min-w-8 rounded-lg px-2 py-1.5 text-xs font-bold ${
                      i === safePage
                        ? "bg-admin text-white"
                        : "border border-admin-line text-admin-ink hover:bg-admin-bg"
                    }`}
                  >
                    {i + 1}
                  </button>
                </span>
              ))}
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}

function QuestionRow({
  q,
  open,
  onToggle,
}: {
  q: ReviewQuestion;
  open: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLE[q.status];
  return (
    <>
      <tr className="border-b border-admin-line/50">
        <td className="px-4 py-3 font-bold text-admin-ink">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="underline-offset-2 hover:underline"
          >
            {q.number}
          </button>
        </td>
        <td className="px-4 py-3 text-admin-muted">{q.section}</td>
        <td className="px-4 py-3 font-semibold text-admin-ink">
          {formatAnswer(q.yourAnswer)}
        </td>
        <td className="px-4 py-3 font-semibold text-success">
          {formatAnswer(q.correctAnswer)}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style.cls}`}
          >
            {style.label}
          </span>
        </td>
        <td
          className={`px-4 py-3 text-right font-bold ${
            q.marksAwarded > 0
              ? "text-success"
              : q.marksAwarded < 0
                ? "text-danger"
                : "text-admin-muted"
          }`}
        >
          {q.marksAwarded > 0 ? `+${q.marksAwarded}` : q.marksAwarded}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-admin-line/50 bg-admin-bg/30">
          <td colSpan={6} className="px-4 py-4">
            <p className="text-sm font-semibold text-admin-ink">
              {q.statement}
            </p>
            {q.options && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {q.options.map((o) => {
                  const chosen = Array.isArray(q.yourAnswer)
                    ? q.yourAnswer.includes(o.key)
                    : String(q.yourAnswer ?? "") === o.key;
                  const right = Array.isArray(q.correctAnswer)
                    ? q.correctAnswer.includes(o.key)
                    : String(q.correctAnswer) === o.key;
                  return (
                    <li
                      key={o.key}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        right
                          ? "border-success bg-success/5 text-admin-ink"
                          : chosen
                            ? "border-danger bg-danger/5 text-admin-ink"
                            : "border-admin-line/60 text-admin-muted"
                      }`}
                    >
                      <span className="font-bold">{o.key}.</span> {o.text}
                      {right && (
                        <span className="ml-2 text-xs font-bold text-success">
                          correct answer
                        </span>
                      )}
                      {chosen && !right && (
                        <span className="ml-2 text-xs font-bold text-danger">
                          your answer
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {q.explanation && (
              <div className="mt-3 rounded-lg border border-admin-line/60 bg-white p-3">
                <p className="text-xs font-bold uppercase text-admin-muted">
                  Explanation
                </p>
                <p className="mt-1 text-sm text-admin-ink">{q.explanation}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-admin-muted">
              Worth +{q.marksCorrect} for a correct answer
              {q.marksWrong > 0 ? `, −${q.marksWrong} for a wrong one` : ""}.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad";
  strong?: boolean;
}) {
  const color =
    tone === "good"
      ? "text-success"
      : tone === "bad"
        ? "text-danger"
        : "text-admin-ink";
  return (
    <div className="rounded-xl border border-admin-line/60 bg-white p-4">
      <p className={`${strong ? "text-2xl" : "text-xl"} font-bold ${color}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
    </div>
  );
}
