"use client";

import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import {
  CheckCircleIcon,
  ClipboardIcon,
  PlayIcon,
} from "@/components/student/icons";
import { EmptyPractice } from "@/components/student/practice-bits";
import { useMyDpps } from "@/hooks/use-practice";

/**
 * DPP — Daily Practice Paper (§ Product Structure).
 *
 * Every named paper a teacher has curated and shared with this student's
 * batch, flexible and self-paced: no timer, no tab-switch restriction, no
 * proctoring. Replaces the old ad-hoc "pick a subject and pull questions"
 * Practice Library — a DPP is a fixed, teacher-built paper the student opens
 * by name, not a set they assemble themselves.
 */
export default function StudentDppPage() {
  const { data: dpps, loading, error } = useMyDpps();

  return (
    <StudentShell breadcrumb={["DPP"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          DPP
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Daily Practice Paper — practise at your own pace. No timer, no
          restrictions.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-admin-line/10"
            />
          ))}
        </div>
      ) : (dpps ?? []).length === 0 ? (
        <EmptyPractice
          title="Nothing shared yet"
          body="Your teachers haven't shared a Daily Practice Paper with your batch yet. Check back soon."
          actionHref="/student"
          actionLabel="Back to Home"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(dpps ?? []).map((d) => (
            <li key={d.id}>
              <Link
                href={`/student/dpp/${d.id}`}
                className="flex h-full flex-col rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)] hover:border-admin/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
                    <ClipboardIcon className="size-5" />
                  </span>
                  {d.attempt?.status === "COMPLETED" ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-700">
                      <CheckCircleIcon className="size-3.5" /> Completed
                    </span>
                  ) : d.attempt?.status === "IN_PROGRESS" ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-700">
                      In progress
                    </span>
                  ) : (
                    <span className="rounded-full bg-admin-surface px-2.5 py-1 text-[11px] font-bold uppercase text-admin-muted">
                      Not started
                    </span>
                  )}
                </div>
                <p className="mt-3 font-semibold text-admin-ink">{d.title}</p>
                <p className="mt-1 text-xs text-admin-muted">
                  {[d.subject?.name, d.chapter?.name]
                    .filter(Boolean)
                    .join(" · ") || "Unfiled"}{" "}
                  · {d.questionCount} question{d.questionCount === 1 ? "" : "s"}
                </p>
                {d.attempt && (
                  <p className="mt-1 text-xs font-semibold text-admin">
                    {d.attempt.correct}/{d.attempt.answered} correct so far
                  </p>
                )}
                <span className="mt-auto flex items-center gap-1.5 pt-3 text-sm font-bold text-admin">
                  <PlayIcon className="size-4" />
                  {d.attempt?.status === "COMPLETED"
                    ? "Review"
                    : d.attempt?.status === "IN_PROGRESS"
                      ? "Continue"
                      : "Start"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StudentShell>
  );
}
