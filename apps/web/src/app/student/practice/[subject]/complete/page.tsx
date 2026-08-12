"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  StarIcon,
  TargetIcon,
  TimerIcon,
} from "@/components/student/icons";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PracticeCompletePage() {
  const params = useParams<{ subject: string }>();
  const subject = params.subject ?? "physics";
  const subjectName = titleCase(subject);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-admin/[0.04] px-4 py-10 [font-family:var(--font-hanken)] text-admin-ink">
      <div className="w-full max-w-xl rounded-3xl border border-admin-line/40 bg-white p-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-admin-surface text-admin">
          <StarIcon className="size-8" />
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-admin">
          Great Job!
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-admin-muted">
          You&apos;ve successfully completed the {subjectName}: Laws of Motion
          practice set. Consistency is the key to mastery!
        </p>

        <div className="mt-7 grid grid-cols-3 gap-4">
          <ResultTile
            icon={<CheckCircleIcon className="size-5" />}
            label="Score"
            value="18/25"
          />
          <ResultTile
            icon={<TargetIcon className="size-5" />}
            label="Accuracy"
            value="72%"
          />
          <ResultTile
            icon={<TimerIcon className="size-5" />}
            label="Time Taken"
            value="32m"
          />
        </div>

        <div className="mt-6 rounded-2xl bg-admin-bg p-5 text-left">
          <p className="text-sm font-bold text-admin-ink">Topic Performance</p>
          <PerfBar label="This Attempt" value={72} strong />
          <PerfBar label="Personal Average" value={65} />
          <p className="mt-3 text-xs text-admin-muted">
            You performed{" "}
            <span className="font-semibold text-admin">7% better</span> than
            your average in this topic!
          </p>
        </div>

        <Link
          href={`/student/practice/${subject}/session`}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-admin px-6 py-3.5 text-sm font-bold text-white hover:opacity-95"
        >
          Review Solutions <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          href="/student"
          className="mt-4 block text-sm font-semibold text-admin-muted hover:text-admin-ink"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

function ResultTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-admin-bg py-5">
      <span className="text-admin">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </span>
      <span className="text-xl font-bold text-admin-ink">{value}</span>
    </div>
  );
}

function PerfBar({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs">
        <span
          className={
            strong ? "font-semibold text-admin-ink" : "text-admin-muted"
          }
        >
          {label}
        </span>
        <span className="font-semibold text-admin">{value}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#e1e3e4]">
        <div
          className={`h-full rounded-full ${strong ? "bg-admin" : "bg-admin-line"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
