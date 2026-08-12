"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  CheckCircleIcon,
  ClockIcon,
  TargetIcon,
  TrophyIcon,
  XCircleIcon,
} from "@/components/student/icons";
import { ApiError } from "@/lib/api";
import { fetchAttemptResult, type AttemptResult } from "@/lib/student";

type Section = { sectionId?: string; name?: string; score?: number };

/**
 * A student's result for ONE exam. Backed by GET /attempts/:id/result, which
 * 404s until an admin publishes — that 404 is the "results pending" state, not
 * an error, so it gets its own screen rather than a failure message.
 */
/** The reports index is where a single result belongs. */
const REPORTS_CRUMB = {
  label: "Performance Reports",
  href: "/student/reports",
};

export default function StudentResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId ?? "";

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    fetchAttemptResult(attemptId)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // 404 => evaluated-but-held, or not evaluated yet. Both mean "pending".
        if (e instanceof ApiError && e.status === 404) setPending(true);
        else setError(e instanceof Error ? e.message : "Could not load result");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (loading) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Result"]}>
        <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
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

  if (error || !result) {
    return (
      <StudentShell breadcrumb={[REPORTS_CRUMB, "Result"]}>
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error ?? "Result not available."}
        </p>
      </StudentShell>
    );
  }

  const pct =
    result.maxScore > 0
      ? Math.round((result.totalScore / result.maxScore) * 100)
      : 0;
  const sections = Array.isArray(result.sectionScores)
    ? (result.sectionScores as Section[])
    : [];

  return (
    <StudentShell breadcrumb={[REPORTS_CRUMB, result.exam.title]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          {result.exam.title}
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Your published result for this exam.
        </p>
      </header>

      {/* Headline score */}
      <div className="rounded-2xl bg-admin p-8 text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Total Score
        </p>
        <p className="mt-2 text-5xl font-bold">
          {result.totalScore}
          <span className="text-2xl font-normal text-white/70">
            /{result.maxScore}
          </span>
        </p>
        <p className="mt-2 text-lg font-semibold text-white/90">{pct}%</p>
      </div>

      {/* Breakdown */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={<CheckCircleIcon className="size-5" />}
          label="Correct"
          value={result.correctCount}
          tone="text-emerald-700 bg-emerald-50"
        />
        <Stat
          icon={<XCircleIcon className="size-5" />}
          label="Incorrect"
          value={result.incorrectCount}
          tone="text-red-700 bg-red-50"
        />
        <Stat
          icon={<ClockIcon className="size-5" />}
          label="Unattempted"
          value={result.unattemptedCount}
          tone="text-admin-muted bg-admin-line/20"
        />
        <Stat
          icon={<TrophyIcon className="size-5" />}
          label="Overall Rank"
          value={result.overallRank ?? "—"}
          tone="text-admin bg-admin/10"
        />
      </div>

      {/* Ranking */}
      {(result.batchRank !== null || result.percentile !== null) && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {result.batchRank !== null && (
            <Panel
              icon={<TargetIcon className="size-5" />}
              label="Batch Rank"
              value={`#${result.batchRank}`}
            />
          )}
          {result.percentile !== null && (
            <Panel
              icon={<TrophyIcon className="size-5" />}
              label="Percentile"
              value={`${result.percentile}`}
            />
          )}
        </div>
      )}

      {/* Per-section */}
      {sections.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-admin-muted">
            Section Breakdown
          </h2>
          <div className="overflow-hidden rounded-xl border border-admin-line/40 bg-white">
            {sections.map((s, i) => (
              <div
                key={s.sectionId ?? s.name ?? i}
                className="flex items-center justify-between border-b border-admin-line/20 px-5 py-4 last:border-b-0"
              >
                <span className="text-sm font-medium text-admin-ink">
                  {s.name ?? `Section ${i + 1}`}
                </span>
                <span className="text-sm font-bold text-admin-ink">
                  {s.score ?? 0}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Link
        href="/student/reports"
        className="mt-6 inline-flex rounded-lg border border-admin-line px-5 py-2.5 text-sm font-bold text-admin hover:bg-admin/5"
      >
        Back to Performance Reports
      </Link>
    </StudentShell>
  );
}

function ResultPending() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-admin-line/40 bg-white p-10 text-center shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <ClockIcon className="size-8" />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-admin-ink">
        Results pending
      </h1>
      <p className="mt-2 text-sm text-admin-muted">
        Your responses have been recorded. This result will appear here as soon
        as your institute evaluates and publishes it.
      </p>
      <Link
        href="/student/reports"
        className="mt-6 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
      >
        Back to Performance Reports
      </Link>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-admin-line/40 bg-white p-5">
      <span
        className={`flex size-9 items-center justify-center rounded-full ${tone}`}
      >
        {icon}
      </span>
      <p className="mt-3 text-2xl font-bold text-admin-ink">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
    </div>
  );
}

function Panel({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-admin-line/40 bg-white p-5">
      <span className="flex size-10 items-center justify-center rounded-full bg-admin/10 text-admin">
        {icon}
      </span>
      <span>
        <span className="block text-xs font-semibold uppercase tracking-wide text-admin-muted">
          {label}
        </span>
        <span className="block text-xl font-bold text-admin-ink">{value}</span>
      </span>
    </div>
  );
}
