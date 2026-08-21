"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  BarChartIcon,
  CheckCircleIcon,
  ClockIcon,
  ListIcon,
  TargetIcon,
  TimerIcon,
  TrendingUpIcon,
  TrophyIcon,
  XCircleIcon,
} from "@/components/student/icons";
import {
  LegendDot,
  MeterRow,
  NotRecorded,
  PassFailBadge,
  PerformanceBadge,
  ResultCard,
  ResultStat,
  StackedBar,
} from "@/components/student/result-bits";
import { StudentShell } from "@/components/student/student-shell";
import { ApiError } from "@/lib/api";
import {
  formatDurationMs,
  negativeMarkingAnalysis,
  resultSummary,
  scorePercentage,
  sectionPerformance,
  statusBreakdown,
  subjectPerformance,
  timeAnalysis,
} from "@/lib/result-analytics";
import {
  fetchAttemptCohort,
  fetchAttemptResult,
  fetchAttemptReview,
  type AttemptCohort,
  type AttemptResult,
  type AttemptReview,
} from "@/lib/student";

/** The reports index is where a single result belongs. */
const REPORTS_CRUMB = {
  label: "Performance Reports",
  href: "/student/reports",
};

/**
 * A student's result for ONE exam (§2.8). Backed by GET /attempts/:id/result,
 * which 404s until an admin publishes — that 404 is the "results pending"
 * state, not an error, so it gets its own screen rather than a failure message.
 *
 * The review and cohort payloads are fetched alongside it and are BOTH
 * optional: the per-question breakdowns (subject-wise, status, negative
 * marking, time) degrade to a "not available" note rather than taking the
 * whole page down, and the cohort comparison is suppressed outright when the
 * cohort is too small to anonymise.
 */
export default function StudentResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId ?? "";

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [cohort, setCohort] = useState<AttemptCohort | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;

    // Settled independently: the result is the page, the other two only enrich
    // it, so neither may turn a publishable result into an error screen.
    void Promise.allSettled([
      fetchAttemptResult(attemptId),
      fetchAttemptReview(attemptId),
      fetchAttemptCohort(attemptId),
    ]).then(([res, rev, coh]) => {
      if (cancelled) return;
      if (res.status === "fulfilled") {
        setResult(res.value);
      } else {
        const e: unknown = res.reason;
        // 404 => evaluated-but-held, or not evaluated yet. Both mean "pending".
        if (e instanceof ApiError && e.status === 404) setPending(true);
        else setError(e instanceof Error ? e.message : "Could not load result");
      }
      if (rev.status === "fulfilled") setReview(rev.value);
      if (coh.status === "fulfilled") setCohort(coh.value);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const questions = useMemo(() => review?.questions ?? [], [review]);

  const summary = useMemo(
    () => (result ? resultSummary(result) : null),
    [result],
  );
  const sections = useMemo(
    () => sectionPerformance(result?.sectionScores ?? null),
    [result],
  );
  const subjects = useMemo(() => subjectPerformance(questions), [questions]);
  const breakdown = useMemo(() => statusBreakdown(questions), [questions]);
  const timing = useMemo(
    () =>
      timeAnalysis(
        questions,
        review?.startedAt ?? null,
        review?.submittedAt ?? null,
      ),
    [questions, review],
  );
  const negative = useMemo(
    () =>
      result
        ? negativeMarkingAnalysis(questions, result.totalScore, result.maxScore)
        : null,
    [questions, result],
  );

  if (loading) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Result"]}>
        <div className="flex flex-col gap-4">
          <div className="h-40 animate-pulse rounded-2xl bg-admin-line/10" />
          <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
        </div>
      </StudentShell>
    );
  }

  if (pending) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Result"]}>
        <ResultPending />
      </StudentShell>
    );
  }

  if (error || !result || !summary) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Result"]}>
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error ?? "Could not load result"}
        </p>
      </StudentShell>
    );
  }

  const totalQuestions =
    result.correctCount + result.incorrectCount + result.unattemptedCount;

  return (
    <StudentShell breadcrumb={[REPORTS_CRUMB, result.exam.title]}>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
        {/* ---------- Header ---------- */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
              {result.exam.title}
            </h1>
            <p className="mt-1 text-sm text-admin-muted">
              {result.publishedAt
                ? `Result published on ${formatDateTime(result.publishedAt)}`
                : "Result published"}
            </p>
          </div>
          <Link
            href={`/student/results/${attemptId}/review`}
            className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            <ListIcon className="size-4" />
            Review my answers
          </Link>
        </div>

        {/* ---------- Headline ---------- */}
        <section className="rounded-2xl bg-admin p-8 text-center text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            Total Score
          </p>
          <p className="mt-2 text-5xl font-bold">
            {round(result.totalScore)}
            <span className="text-2xl font-semibold text-white/70">
              {" "}
              / {round(result.maxScore)}
            </span>
          </p>
          <p className="mt-1 text-lg font-semibold text-white/90">
            {summary.percentage}%
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <PerformanceBadge band={summary.band} />
            {summary.passed !== null && (
              <PassFailBadge passed={summary.passed} />
            )}
            {result.exam.passingMarks !== null && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                Pass mark {round(result.exam.passingMarks)}
              </span>
            )}
          </div>
        </section>

        {/* ---------- Headline stats ---------- */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ResultStat
            icon={CheckCircleIcon}
            label="Correct"
            value={result.correctCount}
            tone="good"
          />
          <ResultStat
            icon={XCircleIcon}
            label="Incorrect"
            value={result.incorrectCount}
            tone="bad"
          />
          <ResultStat
            icon={ClockIcon}
            label="Skipped"
            value={result.unattemptedCount}
            tone="muted"
          />
          <ResultStat
            icon={TargetIcon}
            label="Accuracy"
            value={summary.accuracy === null ? "—" : `${summary.accuracy}%`}
            hint={
              summary.accuracy === null
                ? "Nothing attempted"
                : `${summary.attempted} of ${totalQuestions} attempted`
            }
          />
        </div>

        {/* ---------- Rank / percentile ---------- */}
        {(result.overallRank !== null ||
          result.batchRank !== null ||
          result.percentile !== null) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ResultStat
              icon={TrophyIcon}
              label="Overall rank"
              value={
                result.overallRank === null ? "—" : `#${result.overallRank}`
              }
              hint={
                result.cohortSize > 0
                  ? `of ${result.cohortSize} candidates`
                  : undefined
              }
            />
            <ResultStat
              icon={TrophyIcon}
              label="Batch rank"
              value={result.batchRank === null ? "—" : `#${result.batchRank}`}
            />
            <ResultStat
              icon={TrendingUpIcon}
              label="Percentile"
              value={
                result.percentile === null ? "—" : result.percentile.toFixed(2)
              }
              hint={
                result.percentile === null
                  ? undefined
                  : "Share of candidates at or below your score"
              }
            />
          </div>
        )}

        {/* ---------- Score comparison ---------- */}
        <ResultCard
          title="Score comparison"
          subtitle="How your score sits against everyone who sat this paper."
        >
          {cohort?.available ? (
            <div className="flex flex-col gap-4">
              <MeterRow
                label="You"
                caption={`${round(result.totalScore)} / ${round(result.maxScore)}`}
                value={Math.max(0, result.totalScore)}
                max={result.maxScore}
              />
              <MeterRow
                label="Class average"
                caption={round(cohort.average)}
                value={Math.max(0, cohort.average)}
                max={result.maxScore}
                tone="muted"
              />
              {cohort.batchAverage !== null && (
                <MeterRow
                  label="Your batch average"
                  caption={round(cohort.batchAverage)}
                  value={Math.max(0, cohort.batchAverage)}
                  max={result.maxScore}
                  tone="muted"
                />
              )}
              <MeterRow
                label="Highest score"
                caption={round(cohort.highest)}
                value={Math.max(0, cohort.highest)}
                max={result.maxScore}
                tone="good"
              />
              <p className="text-sm text-admin-muted">
                {comparisonSentence(result.totalScore, cohort.average)} Median
                was {round(cohort.median)} across {cohort.cohortSize}{" "}
                candidates.
              </p>
            </div>
          ) : (
            <NotRecorded
              what={
                cohort
                  ? `Comparison needs at least a handful of candidates — only ${cohort.cohortSize} ${cohort.cohortSize === 1 ? "result is" : "results are"} in so far.`
                  : "Class comparison is not available for this exam."
              }
            />
          )}
        </ResultCard>

        {/* ---------- Section-wise ---------- */}
        <ResultCard
          title="Section-wise performance"
          subtitle="Marks, accuracy and attempts for each section of the paper."
        >
          {sections.length === 0 ? (
            <NotRecorded what="No section breakdown was recorded for this attempt." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-admin-line/60 text-left text-[11px] uppercase tracking-wide text-admin-muted">
                    <th className="pb-2 font-semibold">Section</th>
                    <th className="pb-2 font-semibold">Marks</th>
                    <th className="pb-2 font-semibold">Correct</th>
                    <th className="pb-2 font-semibold">Incorrect</th>
                    <th className="pb-2 font-semibold">Skipped</th>
                    <th className="pb-2 font-semibold">Accuracy</th>
                    <th className="pb-2 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((s) => {
                    const cohortAvg = cohort?.available
                      ? cohort.sections.find((x) => x.sectionId === s.sectionId)
                      : undefined;
                    return (
                      <tr
                        key={s.sectionId}
                        className="border-b border-admin-line/30 last:border-b-0"
                      >
                        <td className="py-3">
                          <p className="font-semibold text-admin-ink">
                            {s.name}
                          </p>
                          {cohortAvg && (
                            <p className="text-xs text-admin-subtle">
                              class avg {round(cohortAvg.averageScore)}
                            </p>
                          )}
                        </td>
                        <td className="py-3 text-admin-ink">
                          {round(s.score)}
                          {s.maxScore !== null && (
                            <span className="text-admin-subtle">
                              {" "}
                              / {round(s.maxScore)}
                            </span>
                          )}
                          {s.percentage !== null && (
                            <span className="ml-1 text-xs text-admin-subtle">
                              ({s.percentage}%)
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-success">{s.correct}</td>
                        <td className="py-3 text-danger">{s.incorrect}</td>
                        <td className="py-3 text-admin-muted">
                          {s.unattempted}
                        </td>
                        <td className="py-3 font-semibold text-admin-ink">
                          {s.accuracy === null ? "—" : `${s.accuracy}%`}
                        </td>
                        <td className="py-3 text-admin-muted">
                          {s.seconds === null
                            ? "—"
                            : formatDurationMs(s.seconds * 1000)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ResultCard>

        {/* ---------- Subject-wise ---------- */}
        <ResultCard
          title="Subject-wise performance"
          subtitle="Grouped by what each question is about, which may cut across sections."
        >
          {subjects.length === 0 ? (
            <NotRecorded what="Subject breakdown needs the per-question review, which is not available for this attempt." />
          ) : (
            <div className="flex flex-col gap-4">
              {subjects.map((s) => (
                <div key={s.subject}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-admin-ink">{s.subject}</p>
                    <p className="text-xs text-admin-muted">
                      {round(s.score)} / {round(s.maxScore)} ({s.percentage}%) ·{" "}
                      {s.accuracy === null
                        ? "no attempts"
                        : `${s.accuracy}% accuracy`}
                    </p>
                  </div>
                  <div className="mt-2">
                    <StackedBar
                      segments={[
                        {
                          label: "Correct",
                          value: s.correct,
                          className: "bg-success",
                        },
                        {
                          label: "Incorrect",
                          value: s.incorrect,
                          className: "bg-danger",
                        },
                        {
                          label: "Skipped",
                          value: s.unattempted,
                          className: "bg-admin-line",
                        },
                      ]}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <LegendDot
                      className="bg-success"
                      label="Correct"
                      value={s.correct}
                    />
                    <LegendDot
                      className="bg-danger"
                      label="Incorrect"
                      value={s.incorrect}
                    />
                    <LegendDot
                      className="bg-admin-line"
                      label="Skipped"
                      value={s.unattempted}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ResultCard>

        {/* ---------- Time analysis ---------- */}
        <ResultCard
          title="Time analysis"
          subtitle="How long the paper took, and where the time went."
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <ResultStat
              icon={ClockIcon}
              label="Total time"
              value={
                timing.totalMs === null ? "—" : formatDurationMs(timing.totalMs)
              }
              hint={`Allowed ${result.exam.durationMinutes} min`}
            />
            <ResultStat
              icon={TimerIcon}
              label="Avg / question"
              value={
                timing.averageMsPerQuestion === null
                  ? "—"
                  : formatDurationMs(timing.averageMsPerQuestion)
              }
              hint={
                timing.unavailable
                  ? "Not recorded"
                  : `Over ${timing.timedCount} timed questions`
              }
            />
            <ResultStat
              icon={TrendingUpIcon}
              label="Fastest"
              value={
                timing.fastest === null
                  ? "—"
                  : formatDurationMs(timing.fastest.ms)
              }
              hint={
                timing.fastest === null
                  ? undefined
                  : `Question ${timing.fastest.number}`
              }
            />
            <ResultStat
              icon={ClockIcon}
              label="Slowest"
              value={
                timing.slowest === null
                  ? "—"
                  : formatDurationMs(timing.slowest.ms)
              }
              hint={
                timing.slowest === null
                  ? undefined
                  : `Question ${timing.slowest.number}`
              }
            />
          </div>
          {timing.unavailable && (
            <p className="mt-4 text-xs text-admin-subtle">
              Per-question timing was not recorded for this attempt. It is
              captured for exams sat from now on.
            </p>
          )}
        </ResultCard>

        {/* ---------- Question status + negative marking ---------- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ResultCard
            title="Question status"
            subtitle="What happened to each of the paper's questions."
          >
            {breakdown.total === 0 ? (
              <NotRecorded what="Per-question detail is not available for this attempt." />
            ) : (
              <>
                <StackedBar
                  segments={[
                    {
                      label: "Correct",
                      value: breakdown.correct + breakdown.bonus,
                      className: "bg-success",
                    },
                    {
                      label: "Incorrect",
                      value: breakdown.incorrect,
                      className: "bg-danger",
                    },
                    {
                      label: "Skipped",
                      value: breakdown.skipped,
                      className: "bg-warn",
                    },
                    {
                      label: "Not visited",
                      value: breakdown.notVisited,
                      className: "bg-admin-line",
                    },
                  ]}
                />
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <StatusLine
                    label="Correct"
                    value={breakdown.correct}
                    className="text-success"
                  />
                  <StatusLine
                    label="Incorrect"
                    value={breakdown.incorrect}
                    className="text-danger"
                  />
                  <StatusLine
                    label="Skipped (seen)"
                    value={breakdown.skipped}
                    className="text-warn"
                  />
                  <StatusLine
                    label="Never opened"
                    value={breakdown.notVisited}
                    className="text-admin-muted"
                  />
                  <StatusLine
                    label="Marked for review"
                    value={breakdown.markedForReview}
                    className="text-brand"
                  />
                  {breakdown.bonus > 0 && (
                    <StatusLine
                      label="Grace marks"
                      value={breakdown.bonus}
                      className="text-admin"
                    />
                  )}
                  {breakdown.dropped > 0 && (
                    <StatusLine
                      label="Dropped"
                      value={breakdown.dropped}
                      className="text-admin-muted"
                    />
                  )}
                </div>
              </>
            )}
          </ResultCard>

          <ResultCard
            title="Negative marking"
            subtitle="Marks surrendered specifically to wrong answers."
          >
            {!negative || breakdown.total === 0 ? (
              <NotRecorded what="Per-question detail is not available for this attempt." />
            ) : negative.incorrectCount === 0 ? (
              <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-success">
                  No marks lost to negative marking.
                </p>
                <p className="mt-1 text-xs text-admin-muted">
                  Nothing you attempted was marked wrong.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-3xl font-bold text-danger">
                    −{round(negative.marksLost)}
                  </p>
                  <p className="mt-0.5 text-xs text-admin-muted">
                    lost across {negative.incorrectCount} wrong{" "}
                    {negative.incorrectCount === 1 ? "answer" : "answers"} —{" "}
                    {negative.percentageOfMax}% of the paper&apos;s total marks
                  </p>
                </div>
                <div className="rounded-lg bg-admin-bg p-4">
                  <p className="text-xs text-admin-muted">
                    Without negative marking you would have scored
                  </p>
                  <p className="mt-1 text-lg font-bold text-admin-ink">
                    {round(negative.scoreWithoutPenalty)} /{" "}
                    {round(result.maxScore)}
                    <span className="ml-2 text-sm font-semibold text-admin-muted">
                      (
                      {scorePercentage(
                        negative.scoreWithoutPenalty,
                        result.maxScore,
                      )}
                      %)
                    </span>
                  </p>
                </div>
              </div>
            )}
          </ResultCard>
        </div>

        {/* ---------- Footer CTAs ---------- */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/student/results/${attemptId}/review`}
            className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            <ListIcon className="size-4" />
            Review my answers
          </Link>
          <Link
            href="/student/reports"
            className="rounded-lg border border-admin-line px-5 py-2.5 text-sm font-bold text-admin hover:bg-admin/5"
          >
            Back to Performance Reports
          </Link>
        </div>
      </div>
    </StudentShell>
  );
}

function StatusLine({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-admin-muted">{label}</span>
      <span className={`font-bold ${className}`}>{value}</span>
    </div>
  );
}

function ResultPending() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin-surface">
        <BarChartIcon className="size-6 text-admin-muted" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-admin-ink">
        Result not published yet
      </h1>
      <p className="mt-2 text-sm text-admin-muted">
        Your paper has been submitted. The result will appear here once your
        institute releases it.
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

/** Trims a trailing `.0` so whole marks don't read as "40.0". */
function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One plain sentence placing the candidate against the cohort. */
function comparisonSentence(score: number, average: number): string {
  const delta = score - average;
  const rounded = Math.abs(Math.round(delta * 10) / 10);
  if (rounded < 0.5) return "You scored right around the class average.";
  return delta > 0
    ? `You scored ${rounded} marks above the class average.`
    : `You scored ${rounded} marks below the class average.`;
}
