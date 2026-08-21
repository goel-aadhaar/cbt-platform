"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthedImage } from "@/components/authed-image";
import { RichText } from "@/components/rich-text";
import {
  BarChartIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  LightbulbIcon,
  ListIcon,
  XCircleIcon,
} from "@/components/student/icons";
import { NotRecorded, ResultCard } from "@/components/student/result-bits";
import { StudentShell } from "@/components/student/student-shell";
import { ApiError } from "@/lib/api";
import {
  formatDurationMs,
  isSlowQuestion,
  timeAnalysis,
} from "@/lib/result-analytics";
import {
  fetchAttemptReview,
  formatAnswer,
  type AttemptReview,
  type ReviewQuestion,
  type ReviewStatus,
} from "@/lib/student";

const STATUS_STYLE: Record<ReviewStatus, { label: string; cls: string }> = {
  CORRECT: { label: "Correct", cls: "bg-success/10 text-success" },
  INCORRECT: { label: "Incorrect", cls: "bg-danger/10 text-danger" },
  UNATTEMPTED: { label: "Not attempted", cls: "bg-fill text-muted" },
  // Post-exam remediation (§2.9) — the candidate should see why the marks
  // differ from a plain right/wrong reading of their answer.
  BONUS: { label: "Bonus", cls: "bg-brand-soft text-brand" },
  DROPPED: { label: "Dropped", cls: "bg-fill text-muted" },
};

/**
 * Filters go beyond the raw status enum: "Marked" and "Slow" are cross-cutting
 * properties a candidate actually wants to revisit by, not statuses.
 */
type FilterKey =
  | "ALL"
  | "CORRECT"
  | "INCORRECT"
  | "UNATTEMPTED"
  | "MARKED"
  | "SLOW"
  | "BONUS"
  | "DROPPED";

const DIFFICULTY_STYLE: Record<string, string> = {
  EASY: "bg-admin-mint/50 text-admin",
  MEDIUM: "bg-warn/15 text-warn",
  HARD: "bg-danger/10 text-danger",
};

/**
 * Per-question evaluation of a submitted attempt (§2.8).
 *
 * Backed by GET /attempts/:id/review, which 404s until an administrator
 * publishes the result — that 404 is the "pending" state, not a failure.
 *
 * Two ways through the same list: a compact index for scanning, and a focused
 * one-question-at-a-time reader with Previous/Next so a candidate can work
 * through their mistakes without bouncing back to the list each time.
 */
export default function AttemptReviewPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId ?? "";

  const [review, setReview] = useState<AttemptReview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  /** Index INTO THE FILTERED LIST, or null while showing the index view. */
  const [focused, setFocused] = useState<number | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    fetchAttemptReview(attemptId)
      .then((r) => {
        if (cancelled) return;
        setReview(r);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setPending(true);
        else setError(e instanceof Error ? e.message : "Could not load review");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const questions = useMemo(() => review?.questions ?? [], [review]);

  const timing = useMemo(
    () =>
      timeAnalysis(
        questions,
        review?.startedAt ?? null,
        review?.submittedAt ?? null,
      ),
    [questions, review],
  );

  const matches = useMemo(
    () =>
      (q: ReviewQuestion): boolean => {
        switch (filter) {
          case "ALL":
            return true;
          case "MARKED":
            return q.markedForReview;
          case "SLOW":
            return isSlowQuestion(q, timing.slowThresholdMs);
          default:
            return q.status === filter;
        }
      },
    [filter, timing.slowThresholdMs],
  );

  const filtered = useMemo(
    () => questions.filter(matches),
    [questions, matches],
  );

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      ALL: questions.length,
      CORRECT: 0,
      INCORRECT: 0,
      UNATTEMPTED: 0,
      MARKED: 0,
      SLOW: 0,
      BONUS: 0,
      DROPPED: 0,
    };
    for (const q of questions) {
      if (q.status in c) c[q.status as FilterKey] += 1;
      if (q.markedForReview) c.MARKED += 1;
      if (isSlowQuestion(q, timing.slowThresholdMs)) c.SLOW += 1;
    }
    return c;
  }, [questions, timing.slowThresholdMs]);

  /**
   * Only offer filters that would actually return something — a paper with no
   * grace marks should not show an inert "Bonus (0)" pill. "All" always shows.
   */
  const availableFilters = useMemo(() => {
    const all: { key: FilterKey; label: string }[] = [
      { key: "ALL", label: "All" },
      { key: "INCORRECT", label: "Incorrect" },
      { key: "CORRECT", label: "Correct" },
      { key: "UNATTEMPTED", label: "Skipped" },
      { key: "MARKED", label: "Marked for review" },
      { key: "SLOW", label: "Slow questions" },
      { key: "BONUS", label: "Bonus" },
      { key: "DROPPED", label: "Dropped" },
    ];
    return all.filter((f) => f.key === "ALL" || counts[f.key] > 0);
  }, [counts]);

  function changeFilter(next: FilterKey) {
    setFilter(next);
    // The focused index points into the filtered list, so it is meaningless
    // once the filter changes — drop back to the index rather than landing
    // the reader on an unrelated question.
    setFocused(null);
  }

  if (loading) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Evaluation"]}>
        <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
      </StudentShell>
    );
  }

  if (pending) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Evaluation"]}>
        <ReviewPending />
      </StudentShell>
    );
  }

  if (error || !review) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Evaluation"]}>
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error ?? "Could not load review"}
        </p>
      </StudentShell>
    );
  }

  const { summary } = review;
  const focusedQuestion = focused === null ? null : filtered[focused];

  return (
    <StudentShell
      breadcrumb={[
        REPORTS_CRUMB,
        { label: review.exam.title, href: `/student/results/${attemptId}` },
        "Evaluation",
      ]}
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
        {/* ---------- Header ---------- */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
              {review.exam.title}
            </h1>
            <p className="mt-1 text-sm text-admin-muted">
              Question-by-question evaluation
              {review.submittedAt
                ? ` of your attempt submitted on ${formatDate(review.submittedAt)}`
                : ""}
              .
            </p>
          </div>
          <Link
            href={`/student/results/${attemptId}`}
            className="rounded-lg border border-admin-line px-4 py-2.5 text-sm font-bold text-admin hover:bg-admin/5"
          >
            Back to result
          </Link>
        </div>

        {/* ---------- Totals ---------- */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Total
            label="Score"
            value={`${round(summary.totalScore)} / ${round(summary.maxScore)}`}
          />
          <Total label="Questions" value={summary.totalQuestions} />
          <Total label="Attempted" value={summary.attempted} />
          <Total
            label="Correct"
            value={summary.correctCount}
            tone="text-success"
          />
          <Total
            label="Incorrect"
            value={summary.incorrectCount}
            tone="text-danger"
          />
          <Total label="Skipped" value={summary.unattemptedCount} />
        </div>

        {/* ---------- Filters ---------- */}
        <div className="flex flex-wrap gap-2">
          {availableFilters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => changeFilter(f.key)}
                aria-pressed={active}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  active
                    ? "bg-admin text-white"
                    : "border border-admin-line bg-white text-admin-ink hover:bg-admin-bg"
                }`}
              >
                {f.label} ({counts[f.key]})
              </button>
            );
          })}
        </div>

        {filter === "SLOW" && timing.slowThresholdMs !== null && (
          <p className="text-xs text-admin-subtle">
            Questions that took longer than{" "}
            {formatDurationMs(timing.slowThresholdMs)} — half again the time you
            spent on a typical question in this paper.
          </p>
        )}

        {/* ---------- Body ---------- */}
        {filtered.length === 0 ? (
          <NotRecorded what="No questions match this filter." />
        ) : focusedQuestion ? (
          <FocusedView
            question={focusedQuestion}
            position={focused! + 1}
            total={filtered.length}
            onPrev={() => setFocused((i) => Math.max(0, (i ?? 0) - 1))}
            onNext={() =>
              setFocused((i) => Math.min(filtered.length - 1, (i ?? 0) + 1))
            }
            onClose={() => setFocused(null)}
            slowThresholdMs={timing.slowThresholdMs}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((q, i) => (
              <QuestionIndexRow
                key={q.questionId}
                question={q}
                onOpen={() => setFocused(i)}
                slowThresholdMs={timing.slowThresholdMs}
              />
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}

/* ------------------------------------------------------------------ *
 * Index row                                                            *
 * ------------------------------------------------------------------ */

function QuestionIndexRow({
  question: q,
  onOpen,
  slowThresholdMs,
}: {
  question: ReviewQuestion;
  onOpen: () => void;
  slowThresholdMs: number | null;
}) {
  const style = STATUS_STYLE[q.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-4 rounded-xl border border-admin-line/40 bg-white p-4 text-left shadow-[0_4px_10px_rgba(0,0,0,0.04)] hover:border-admin/40 hover:bg-admin/5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-admin-surface text-sm font-bold text-admin-ink">
        {q.number}
      </span>
      <span className="min-w-0 flex-1">
        <RichText
          as="span"
          text={q.statement}
          className="line-clamp-2 block text-sm text-admin-ink"
        />
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip className={style.cls}>{style.label}</Chip>
          <Chip className="bg-admin-surface text-admin-muted">{q.section}</Chip>
          <Chip className="bg-admin-surface text-admin-muted">{q.subject}</Chip>
          <Chip className={DIFFICULTY_STYLE[q.difficulty] ?? ""}>
            {titleCase(q.difficulty)}
          </Chip>
          {q.markedForReview && (
            <Chip className="bg-brand-soft text-brand">Marked</Chip>
          )}
          {isSlowQuestion(q, slowThresholdMs) && (
            <Chip className="bg-warn/15 text-warn">Slow</Chip>
          )}
          {q.timeSpentMs !== null && (
            <Chip className="bg-admin-surface text-admin-muted">
              {formatDurationMs(q.timeSpentMs)}
            </Chip>
          )}
        </span>
      </span>
      <span
        className={`shrink-0 text-sm font-bold ${
          q.marksAwarded > 0
            ? "text-success"
            : q.marksAwarded < 0
              ? "text-danger"
              : "text-admin-muted"
        }`}
      >
        {q.marksAwarded > 0 ? "+" : ""}
        {round(q.marksAwarded)}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Focused single-question view                                         *
 * ------------------------------------------------------------------ */

function FocusedView({
  question: q,
  position,
  total,
  onPrev,
  onNext,
  onClose,
  slowThresholdMs,
}: {
  question: ReviewQuestion;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  slowThresholdMs: number | null;
}) {
  const style = STATUS_STYLE[q.status];
  const correctKeys = toKeySet(q.correctAnswer);
  const yourKeys = toKeySet(q.yourAnswer);

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation — repeated top and bottom so a long question doesn't
          force a scroll back up to move on. */}
      <NavBar
        position={position}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
      />

      <ResultCard>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-admin text-sm font-bold text-white">
            {q.number}
          </span>
          <Chip className={style.cls}>{style.label}</Chip>
          <Chip className="bg-admin-surface text-admin-muted">{q.section}</Chip>
          <Chip className="bg-admin-surface text-admin-muted">{q.subject}</Chip>
          <Chip className="bg-admin-surface text-admin-muted">{q.chapter}</Chip>
          {q.topic && (
            <Chip className="bg-admin-surface text-admin-muted">{q.topic}</Chip>
          )}
          <Chip className={DIFFICULTY_STYLE[q.difficulty] ?? ""}>
            {titleCase(q.difficulty)}
          </Chip>
          <Chip className="bg-admin-surface text-admin-muted">
            {questionTypeLabel(q.type)}
          </Chip>
          {q.markedForReview && (
            <Chip className="bg-brand-soft text-brand">Marked for review</Chip>
          )}
          {isSlowQuestion(q, slowThresholdMs) && (
            <Chip className="bg-warn/15 text-warn">Slow</Chip>
          )}
        </div>

        <RichText
          text={q.statement}
          className="mt-4 whitespace-pre-wrap text-admin-ink"
        />

        {q.mediaKeys.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {q.mediaKeys.map((key) => (
              <AuthedImage
                key={key}
                url={`/media/file/${encodeURIComponent(key)}`}
                alt="Question diagram"
                className="max-h-72 max-w-full rounded border border-admin-line bg-white object-contain"
              />
            ))}
          </div>
        )}

        {/* Options, or the numeric answer pair for INTEGER. */}
        <div className="mt-5">
          {q.options && q.options.length > 0 ? (
            <div className="flex flex-col gap-2">
              {q.options.map((o) => {
                const isCorrect = correctKeys.has(o.key);
                const isYours = yourKeys.has(o.key);
                return (
                  <div
                    key={o.key}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                      isCorrect
                        ? "border-success/50 bg-success/5"
                        : isYours
                          ? "border-danger/50 bg-danger/5"
                          : "border-admin-line/60"
                    }`}
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isCorrect
                          ? "bg-success text-white"
                          : isYours
                            ? "bg-danger text-white"
                            : "bg-admin-surface text-admin-muted"
                      }`}
                    >
                      {o.key}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-admin-ink">
                      {o.text}
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {isCorrect && (
                        <Chip className="bg-success/10 text-success">
                          Correct answer
                        </Chip>
                      )}
                      {isYours && (
                        <Chip
                          className={
                            isCorrect
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }
                        >
                          Your answer
                        </Chip>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AnswerBox
                label="Your answer"
                value={formatAnswer(q.yourAnswer)}
                tone={q.status === "CORRECT" ? "good" : "bad"}
              />
              <AnswerBox
                label="Correct answer"
                value={formatAnswer(q.correctAnswer)}
                tone="good"
              />
            </div>
          )}
        </div>

        {/* Marks + time */}
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl bg-admin-bg p-4 text-sm">
          <span className="flex items-center gap-2">
            {q.marksAwarded > 0 ? (
              <CheckCircleIcon className="size-4 text-success" />
            ) : q.marksAwarded < 0 ? (
              <XCircleIcon className="size-4 text-danger" />
            ) : (
              <ClockIcon className="size-4 text-admin-muted" />
            )}
            <span className="text-admin-muted">Marks obtained</span>
            <span
              className={`font-bold ${
                q.marksAwarded > 0
                  ? "text-success"
                  : q.marksAwarded < 0
                    ? "text-danger"
                    : "text-admin-ink"
              }`}
            >
              {q.marksAwarded > 0 ? "+" : ""}
              {round(q.marksAwarded)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <ClockIcon className="size-4 text-admin-muted" />
            <span className="text-admin-muted">Time spent</span>
            <span className="font-bold text-admin-ink">
              {q.timeSpentMs === null
                ? "Not recorded"
                : formatDurationMs(q.timeSpentMs)}
            </span>
          </span>
          <span className="text-xs text-admin-subtle">
            Worth +{round(q.marksCorrect)} correct, −{round(q.marksWrong)} wrong
          </span>
        </div>

        {q.explanation && (
          <div className="mt-4 rounded-xl border border-admin-line/60 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
              <LightbulbIcon className="size-4" />
              Explanation
            </p>
            <RichText
              text={q.explanation}
              className="mt-2 whitespace-pre-wrap text-sm text-admin-ink"
            />
          </div>
        )}
      </ResultCard>

      <NavBar
        position={position}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
      />
    </div>
  );
}

function NavBar({
  position,
  total,
  onPrev,
  onNext,
  onClose,
}: {
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={position <= 1}
        className="flex items-center gap-1.5 rounded-lg border border-admin-line bg-white px-4 py-2 text-sm font-bold text-admin hover:bg-admin/5 disabled:opacity-40"
      >
        <ChevronLeftIcon className="size-4" />
        Previous
      </button>
      <div className="flex items-center gap-3">
        <span className="text-sm text-admin-muted">
          {position} of {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-admin-muted hover:text-admin-ink"
        >
          <ListIcon className="size-4" />
          All questions
        </button>
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={position >= total}
        className="flex items-center gap-1.5 rounded-lg border border-admin-line bg-white px-4 py-2 text-sm font-bold text-admin hover:bg-admin/5 disabled:opacity-40"
      >
        Next
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small pieces                                                         *
 * ------------------------------------------------------------------ */

function AnswerBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "good"
          ? "border-success/40 bg-success/5"
          : "border-danger/40 bg-danger/5"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
      <p className="mt-1 font-bold text-admin-ink">{value}</p>
    </div>
  );
}

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
        className || "bg-admin-surface text-admin-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Total({
  label,
  value,
  tone = "text-admin-ink",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-admin-line/40 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function ReviewPending() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin-surface">
        <BarChartIcon className="size-6 text-admin-muted" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-admin-ink">
        Evaluation not released yet
      </h1>
      <p className="mt-2 text-sm text-admin-muted">
        Answers and explanations become available once your institute publishes
        the result for this exam.
      </p>
      <Link
        href="/student/reports"
        className="mt-5 inline-block rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
      >
        Back to Performance Reports
      </Link>
    </div>
  );
}

const REPORTS_CRUMB = {
  label: "Performance Reports",
  href: "/student/reports",
};

/**
 * Answers travel as option KEYS for MCQ/MSQ (the scoring contract) — a Set of
 * them is what lets the option list highlight without re-deriving per option.
 */
function toKeySet(v: string | number | string[] | null): Set<string> {
  if (v === null || v === undefined) return new Set();
  if (Array.isArray(v)) return new Set(v.map(String));
  return new Set([String(v)]);
}

function questionTypeLabel(t: ReviewQuestion["type"]): string {
  return t === "MCQ"
    ? "Single choice"
    : t === "MSQ"
      ? "Multi-select"
      : "Numeric";
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
