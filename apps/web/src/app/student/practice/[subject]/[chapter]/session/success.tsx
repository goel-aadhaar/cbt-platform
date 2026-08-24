"use client";

import Link from "next/link";

import {
  CheckCircleIcon,
  StarIcon,
  TargetIcon,
  TimerIcon,
} from "@/components/student/icons";
import { ProgressBar } from "@/components/student/practice-bits";
import type { PracticeSummary } from "@/lib/practice";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/**
 * Practice set summary (Figma 183:35310).
 *
 * `personalAverage` is null on a first attempt at a scope — there is nothing
 * to compare against yet, so the comparison bar is omitted rather than shown
 * against a fabricated baseline.
 */
export function PracticeSuccess({
  summary,
  subjectSlug,
  chapterSlug,
}: {
  summary: PracticeSummary;
  subjectSlug: string;
  chapterSlug: string;
}) {
  const scope = summary.topic ?? summary.chapter ?? summary.subject;
  const delta = summary.deltaVsAverage;

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-admin-line/40 bg-white p-10 text-center shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-admin/10 text-admin">
        <StarIcon className="size-8" />
      </span>

      <h1 className="mt-4 text-3xl font-bold tracking-[-0.6px] text-admin">
        {summary.accuracy >= 80
          ? "Great Job!"
          : summary.accuracy >= 50
            ? "Nice Work!"
            : "Set Complete"}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-admin-muted">
        You&apos;ve completed the {summary.subject}
        {scope !== summary.subject ? `: ${scope}` : ""} practice set.
        Consistency is the key to mastery!
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure
          icon={<CheckCircleIcon className="size-4" />}
          label="Score"
          value={`${summary.correct}/${summary.total}`}
        />
        <Figure
          icon={<TargetIcon className="size-4" />}
          label="Accuracy"
          value={`${summary.accuracy}%`}
        />
        <Figure
          icon={<TimerIcon className="size-4" />}
          label="Time Taken"
          value={formatDuration(summary.durationSeconds)}
        />
      </div>

      {summary.answered < summary.total && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
          You answered {summary.answered} of {summary.total} — the rest were
          left blank and don&apos;t count towards accuracy.
        </p>
      )}

      <div className="mt-6 rounded-xl bg-admin-bg p-5 text-left">
        <p className="text-sm font-bold text-admin-ink">Topic Performance</p>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-admin-ink">This Attempt</span>
            <span className="font-bold text-admin-ink">
              {summary.accuracy}%
            </span>
          </div>
          <ProgressBar value={summary.accuracy} className="mt-1" />
        </div>

        {summary.personalAverage === null ? (
          <p className="mt-3 text-xs text-admin-muted">
            This is your first set on {scope} — practise it again and we&apos;ll
            show you how you&apos;re improving.
          </p>
        ) : (
          <>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-admin-muted">
                  Personal Average
                </span>
                <span className="font-bold text-admin-muted">
                  {summary.personalAverage}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-admin-line/30">
                <div
                  className="h-full rounded-full bg-admin-muted/60"
                  style={{ width: `${summary.personalAverage}%` }}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-admin-muted">
              {delta !== null && delta > 0 ? (
                <>
                  You performed{" "}
                  <span className="font-bold text-admin">{delta}% better</span>{" "}
                  than your average in this topic!
                </>
              ) : delta !== null && delta < 0 ? (
                <>
                  That&apos;s{" "}
                  <span className="font-bold text-admin-ink">
                    {Math.abs(delta)}% below
                  </span>{" "}
                  your average here — worth another run.
                </>
              ) : (
                <>Right in line with your average in this topic.</>
              )}
            </p>
          </>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/student/practice/${subjectSlug}/${chapterSlug}`}
          className="rounded-lg bg-admin px-6 py-3 text-base font-bold text-white hover:opacity-95"
        >
          Practise another topic
        </Link>
        <Link
          href="/student/practice"
          className="text-sm font-semibold text-admin-muted hover:text-admin-ink"
        >
          Return to Practice Library
        </Link>
      </div>
    </div>
  );
}

function Figure({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-admin-bg py-4">
      <span className="flex justify-center text-admin">{icon}</span>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-admin-ink">{value}</p>
    </div>
  );
}
